package main

import (
	"embed"
	"bufio"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gin-contrib/static"
)

// 嵌入整个 public
//go:embed public/*
var staticFS embed.FS

const (
	ConfigPath     = "/etc/deeprotection/deeprotection.conf"
	LogPath        = "/var/log/deeprotection.log"
	LanguagePath   = "/usr/share/locale/deeprotection/"
	DefaultIP      = "127.0.0.1"
	DefaultPort    = 8080
)

var (
	webIP   = DefaultIP
	webPort = DefaultPort
)

func main() {
	// 解析配置获取Web设置
	parseConfigForWebSettings()

	r := gin.Default()

	// 正确处理EmbedFolder的返回值
	staticFS, err := static.EmbedFolder(staticFS, "public")
	if err != nil {
		log.Fatalf("Failed to create embed folder: %v", err)
	}
	r.Use(static.Serve("/", staticFS))

	api := r.Group("/api")
	{
		api.GET("/config", getConfigHandler)
		api.GET("/stats", getStatsHandler)
		api.POST("/config", updateConfigHandler)
		api.GET("/languages", getLanguagesHandler)
		api.GET("/logs", logStreamHandler)
		api.POST("/reload", reloadHandler)
		api.POST("/restart", restartHandler)
		api.POST("/command", commandHandler)
	}

	addr := fmt.Sprintf("%s:%d", webIP, webPort)
	log.Printf("Starting Deeprotection Web GUI on %s", addr)
	log.Fatal(r.Run(addr))
}

// 获取统计信息
func getStatsHandler(c *gin.Context) {
	// 统计日志行数 (保护次数)
	protectionCount, err := countLogLines()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count log lines"})
		return
	}

	// 计算剩余禁用时间
	remainingTime := ""
	config, err := parseConfig()
	if err == nil {
		basic := config["basic"].(map[string]string)
		if basic["disable"] == "true" {
			remainingTime = calculateRemainingTime(basic)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"protection_count": protectionCount,
		"remaining_time":   remainingTime,
	})
}

// 计算剩余禁用时间
func calculateRemainingTime(basic map[string]string) string {
	expireHours, err := strconv.ParseFloat(basic["expire_hours"], 64)
	if err != nil {
		return "Invalid expire_hours"
	}

	timestamp, err := strconv.ParseInt(basic["timestamp"], 10, 64)
	if err != nil {
		return "Invalid timestamp"
	}

	// 计算过期时间戳
	expireSeconds := int64(expireHours * 3600)
	expireTime := time.Unix(timestamp+expireSeconds, 0)
	now := time.Now()

	if now.After(expireTime) {
		return "Expired"
	}

	// 计算剩余时间
	duration := expireTime.Sub(now)
	hours := int(duration.Hours())
	minutes := int(duration.Minutes()) % 60

	return fmt.Sprintf("%dh %02dm", hours, minutes)
}

// 统计日志行数
func countLogLines() (int, error) {
	file, err := os.Open(LogPath)
	if err != nil {
		return 0, err
	}
	defer file.Close()

	count := 0
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		count++
	}

	return count, scanner.Err()
}

// 解析配置文件获取web设置
func parseConfigForWebSettings() {
	file, err := os.Open(ConfigPath)
	if err != nil {
		log.Printf("Warning: Could not open config file: %v", err)
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		if strings.HasPrefix(trimmed, "web_ip=") {
			parts := strings.SplitN(trimmed, "=", 2)
			if len(parts) == 2 {
				webIP = strings.TrimSpace(parts[1])
			}
		}

		if strings.HasPrefix(trimmed, "web_port=") {
			parts := strings.SplitN(trimmed, "=", 2)
			if len(parts) == 2 {
				if port, err := strconv.Atoi(strings.TrimSpace(parts[1])); err == nil {
					webPort = port
				}
			}
		}
	}

	log.Printf("Web settings: IP=%s, Port=%d", webIP, webPort)
}

// 获取可用语言
func getLanguagesHandler(c *gin.Context) {
	languages := []map[string]string{}

	files, err := os.ReadDir(LanguagePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for _, file := range files {
		if !file.IsDir() && strings.HasSuffix(file.Name(), ".ftl") {
			langCode := strings.TrimSuffix(file.Name(), ".ftl")

			// 从文件读取语言名称
			content, err := os.ReadFile(filepath.Join(LanguagePath, file.Name()))
			if err != nil {
				continue
			}

			// 解析name字段
			nameRegex := regexp.MustCompile(`name\s*=\s*"([^"]+)"`)
			matches := nameRegex.FindStringSubmatch(string(content))
			var name string
			if len(matches) > 1 {
				name = matches[1]
			} else {
				name = langCode
			}

			languages = append(languages, map[string]string{
				"code": langCode,
				"name": name,
			})
		}
	}

	c.JSON(http.StatusOK, languages)
}

// 获取当前配置
func getConfigHandler(c *gin.Context) {
	config, err := parseConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, config)
}

// 更新配置
func updateConfigHandler(c *gin.Context) {
	var configData map[string]interface{}
	if err := c.BindJSON(&configData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	backupPath := ConfigPath + ".bak." + time.Now().Format("20060102-150405")
	if err := copyFile(ConfigPath, backupPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create backup: " + err.Error()})
		return
	}

	if err := updateConfigFile(configData); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update config: " + err.Error()})
		return
	}

	parseConfigForWebSettings()

	c.JSON(http.StatusOK, gin.H{"message": "Configuration updated successfully"})
}

// 解析配置文件
func parseConfig() (map[string]interface{}, error) {
    config := make(map[string]interface{})
    basicConfig := make(map[string]string)
    protectedPaths := []string{}
    commandRules := []string{}

    file, err := os.Open(ConfigPath)
    if err != nil {
        return nil, err
    }
    defer file.Close()

    scanner := bufio.NewScanner(file)
    currentSection := ""

    for scanner.Scan() {
        line := scanner.Text()
        trimmed := strings.TrimSpace(line)

        if trimmed == "" {
            continue
        }

        // 识别 section 开始: 宽松匹配关键字
        if strings.Contains(trimmed, "protected_paths_list") {
            currentSection = "protected_paths_list"
            continue
        }
        if strings.Contains(trimmed, "command_intercept_rules") {
            currentSection = "command_intercept_rules"
            continue
        }

        // 基本配置项 (格式 key=value 且不是注释)
        if strings.Contains(trimmed, "=") && !strings.HasPrefix(trimmed, "#") {
            parts := strings.SplitN(trimmed, "=", 2)
            key := strings.TrimSpace(parts[0])
            value := strings.TrimSpace(parts[1])

            switch key {
            case "language", "disable", "expire_hours", "timestamp", "update", "mode", "web_ip", "web_port":
                basicConfig[key] = value
            }
            // 如果在某些 section 也可能含有 = 但你不希望它当作 basic, 可以进一步区分
            continue
        }

        // 依据当前 section 追加
        if currentSection == "protected_paths_list" {
            if !strings.HasPrefix(trimmed, "#") && trimmed != "" {
                protectedPaths = append(protectedPaths, trimmed)
            }
        } else if currentSection == "command_intercept_rules" {
            if !strings.HasPrefix(trimmed, "#") && trimmed != "" {
                commandRules = append(commandRules, trimmed)
            }
        }
    }

    if err := scanner.Err(); err != nil {
        return nil, err
    }

    config["basic"] = basicConfig
    config["protected_paths"] = protectedPaths
    config["command_rules"] = commandRules

    return config, nil
}

// 更新配置文件
func updateConfigFile(newConfig map[string]interface{}) error {
    content, err := os.ReadFile(ConfigPath)
    if err != nil {
        return err
    }
    lines := strings.Split(string(content), "\n")

    // 更新基本配置项 (如果提供)
    if basic, ok := newConfig["basic"].(map[string]interface{}); ok {
       	for i, line := range lines {
            trimmed := strings.TrimSpace(line)
            if trimmed == "" || strings.HasPrefix(trimmed, "#") {
                continue
            }
            if strings.Contains(trimmed, "=") {
                parts := strings.SplitN(trimmed, "=", 2)
                key := strings.TrimSpace(parts[0])
                if newValue, exists := basic[key]; exists {
                    valueStr := fmt.Sprintf("%v", newValue)
                    lines[i] = fmt.Sprintf("%s=%s", key, valueStr)
                }
            }
        }
    }

    // Helper to replace or insert a section
   	replaceSection := func(sectionKey string, newItems []string) {
        startIdx := -1
        endIdx := -1

        // 定位 section 开头 (包含关键字), 例如包含 "protected_paths_list"
        for i, line := range lines {
            if strings.Contains(line, sectionKey) {
                startIdx = i
                break
            }
        }

        if startIdx == -1 {
            // section 不存在, 跳过 (也可以选择插入整个 section 模板)
           	log.Printf("Warning: section %s not found in config file; skipping update for it", sectionKey)
            return
        }

        // 查找下一个显式的 section 开头 (可能是另一个关键字)或文件末尾, 作为 endIdx (不包含它)
        for i := startIdx + 1; i < len(lines); i++ {
            if strings.Contains(lines[i], "protected_paths_list") || strings.Contains(lines[i], "command_intercept_rules") {
                endIdx = i
                break
            }
        }
        if endIdx == -1 {
            // 到文件末尾
            endIdx = len(lines)
        }

        // 保留 section header line
        newSection := []string{lines[startIdx]}
        // 插入新的内容 (如果有)
        for _, item := range newItems {
            newSection = append(newSection, item)
        }

        // 重建 lines: 替换旧 section 内容 (包含旧 items, 但不包括下一个 section header)
        lines = append(lines[:startIdx], append(newSection, lines[endIdx:]...)...)
    }

    // 处理 protected_paths
    if pathsIface, ok := newConfig["protected_paths"].([]interface{}); ok {
        newPaths := []string{}
        for _, p := range pathsIface {
            if str, ok := p.(string); ok {
                newPaths = append(newPaths, str)
            }
        }
        replaceSection("protected_paths_list", newPaths)
    }

    // 处理 command_rules
    if rulesIface, ok := newConfig["command_rules"].([]interface{}); ok {
        newRules := []string{}
        for _, r := range rulesIface {
            if str, ok := r.(string); ok {
                newRules = append(newRules, str)
            }
        }
        replaceSection("command_intercept_rules", newRules)
    }

    // 写入更新后的配置 (确保以换行结尾)
   	out := strings.Join(lines, "\n")
    if !strings.HasSuffix(out, "\n") {
        out += "\n"
    }
    return os.WriteFile(ConfigPath, []byte(out), 0644)
}


// 流式日志
func logStreamHandler(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Writer.Flush()

	// 打开日志文件
	file, err := os.Open(LogPath)
	if err != nil {
		c.SSEvent("error", fmt.Sprintf("Error opening log file: %v", err))
		return
	}
	defer file.Close()

	// 1. 发送完整的历史日志
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		c.SSEvent("log", scanner.Text())
		c.Writer.Flush()
	}

	// 获取当前文件位置 (文件末尾)
	lastPos, _ := file.Seek(0, io.SeekCurrent)
	lastSize := lastPos

	// 使用ticker定期检查新日志
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	clientGone := c.Writer.CloseNotify()

	for {
		select {
		case <-clientGone:
			return
		case <-ticker.C:
			// 检查文件是否有新内容
			fileInfo, err := os.Stat(LogPath)
			if err != nil {
				c.SSEvent("error", fmt.Sprintf("Error getting file info: %v", err))
				continue
			}

			currentSize := fileInfo.Size()
			if currentSize < lastSize {
				// 文件被截断或轮转, 重置位置并重新发送完整日志
				lastPos = 0
				lastSize = currentSize

				// 重新打开文件读取完整内容
				file.Close()
				file, err = os.Open(LogPath)
				if err != nil {
					c.SSEvent("error", fmt.Sprintf("Error reopening log file: %v", err))
					return
				}

				scanner = bufio.NewScanner(file)
				for scanner.Scan() {
					c.SSEvent("log", scanner.Text())
					c.Writer.Flush()
				}
				lastPos, _ = file.Seek(0, io.SeekCurrent)
				lastSize = lastPos
				continue
			}

			if currentSize <= lastPos {
				// 没有新内容
				continue
			}

			// 读取新内容
			_, err = file.Seek(lastPos, io.SeekStart)
			if err != nil {
				c.SSEvent("error", fmt.Sprintf("Error seeking file: %v", err))
				continue
			}

			scanner = bufio.NewScanner(file)
			for scanner.Scan() {
				c.SSEvent("log", scanner.Text())
				c.Writer.Flush()
			}

			// 更新位置
			newPos, _ := file.Seek(0, io.SeekCurrent)
			lastPos = newPos
			lastSize = currentSize
		}
	}
}

// 重新加载配置
func reloadHandler(c *gin.Context) {
	cmd := exec.Command("dplauncher", "--reload")
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to reload",
			"details": string(output),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Configuration reloaded", "output": string(output)})
}

// 重启服务
func restartHandler(c *gin.Context) {
	cmd := exec.Command("systemctl", "restart", "deeprotection")
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to restart",
			"details": string(output),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Service restarted", "output": string(output)})
}

// 执行自定义命令
func commandHandler(c *gin.Context) {
	var request struct {
		Command string `json:"command"`
	}

	if err := c.BindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if request.Command == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Command cannot be empty"})
		return
	}

	parts := strings.Fields(request.Command)
	if len(parts) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid command"})
		return
	}

	cmd := exec.Command(parts[0], parts[1:]...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Command failed",
			"details": string(output),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Command executed",
		"output":  string(output),
	})
}

// 复制文件用于备份
func copyFile(src, dst string) error {
	source, err := os.Open(src)
	if err != nil {
		return err
	}
	defer source.Close()

	destination, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destination.Close()

	_, err = io.Copy(destination, source)
	return err
}
