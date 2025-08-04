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
	// 解析配置获取Web设置 (移到前面, 确保路由使用正确的IP和端口)
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

// 新增: 获取统计信息
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

		if strings.HasPrefix(trimmed, "#---------------------") {
			currentSection = trimmed
			continue
		}

		if strings.Contains(trimmed, "=") && !strings.HasPrefix(trimmed, "#") {
			parts := strings.SplitN(trimmed, "=", 2)
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])

			switch key {
			case "language", "disable", "expire_hours", "timestamp", "update", "mode", "web_ip", "web_port":
				basicConfig[key] = value
			}
			continue
		}

		if currentSection != "" {
			if strings.Contains(currentSection, "protected_paths_list") {
				if !strings.HasPrefix(trimmed, "#") && trimmed != "" {
					protectedPaths = append(protectedPaths, line)
				}
			} else if strings.Contains(currentSection, "command_intercept_rules") {
				if !strings.HasPrefix(trimmed, "#") && trimmed != "" {
					commandRules = append(commandRules, line)
				}
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

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		if strings.Contains(trimmed, "=") {
			parts := strings.SplitN(trimmed, "=", 2)
			key := strings.TrimSpace(parts[0])

			if basic, ok := newConfig["basic"].(map[string]string); ok {
				if newValue, ok := basic[key]; ok {
					lines[i] = fmt.Sprintf("%s=%s", key, newValue)
				}
			}
		}
	}

	protectedStart := -1
	protectedEnd := -1
	commandStart := -1
	commandEnd := -1

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(trimmed, "#protected_paths_list") {
			protectedStart = i
		} else if strings.Contains(trimmed, "#command_intercept_rules") {
			commandStart = i
		}

		if protectedStart != -1 && protectedEnd == -1 && strings.Contains(trimmed, "#---------------------") {
			protectedEnd = i
		}

		if commandStart != -1 && commandEnd == -1 && strings.Contains(trimmed, "#---------------------") {
			commandEnd = i
		}
	}

	if protectedStart != -1 && protectedEnd != -1 {
		newProtected := []string{}
		if paths, ok := newConfig["protected_paths"].([]interface{}); ok {
			for _, path := range paths {
				if str, ok := path.(string); ok {
					newProtected = append(newProtected, str)
				}
			}
		}

		newSection := []string{lines[protectedStart]}
		newSection = append(newSection, newProtected...)
		newSection = append(newSection, lines[protectedEnd])

		lines = append(lines[:protectedStart], append(newSection, lines[protectedEnd+1:]...)...)
	}

	if commandStart != -1 && commandEnd != -1 {
		newRules := []string{}
		if rules, ok := newConfig["command_rules"].([]interface{}); ok {
			for _, rule := range rules {
				if str, ok := rule.(string); ok {
					newRules = append(newRules, str)
				}
			}
		}

		newSection := []string{lines[commandStart]}
		newSection = append(newSection, newRules...)
		newSection = append(newSection, lines[commandEnd])

		lines = append(lines[:commandStart], append(newSection, lines[commandEnd+1:]...)...)
	}

	return os.WriteFile(ConfigPath, []byte(strings.Join(lines, "\n")), 0644)
}

// 流式日志
func logStreamHandler(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	var lastPos int64 = 0
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	clientGone := c.Writer.CloseNotify()

	for {
		select {
		case <-clientGone:
			return
		case <-ticker.C:
			file, err := os.Open(LogPath)
			if err != nil {
				c.SSEvent("error", fmt.Sprintf("Error opening log file: %v", err))
				continue
			}

			_, err = file.Seek(lastPos, 0)
			if err != nil {
				file.Close()
				continue
			}

			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				c.SSEvent("log", scanner.Text())
				c.Writer.Flush()
			}

			newPos, _ := file.Seek(0, io.SeekCurrent)
			lastPos = newPos

			file.Close()
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
