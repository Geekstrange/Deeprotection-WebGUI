document.addEventListener('DOMContentLoaded', function() {
    // 全局变量
    let currentConfig = null;

    // Navigation
    document.querySelectorAll('nav a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });
            document.querySelectorAll('nav a').forEach(a => {
                a.classList.remove('active');
            });
            this.classList.add('active');
            document.getElementById(this.dataset.page).classList.add('active');
        });
    });


    // Copyright info
    document.querySelector('.copyright').textContent = document.querySelector('.copyright').textContent.replace('%year%', new Date().getFullYear());

    // API functions
    async function fetchConfig() {
        try {
            const response = await fetch('/api/config');

            if (!response.ok) {
                throw new Error('Failed to fetch configuration');
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching config:', error);
            showNotification('Error loading configuration', 'error');
            return null;
        }
    }

    // 新增: 获取统计信息
    async function fetchStats() {
        try {
            const response = await fetch('/api/stats');

            if (!response.ok) {
                throw new Error('Failed to fetch stats');
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching stats:', error);
            return null;
        }
    }

    async function fetchLanguages() {
        try {
            const response = await fetch('/api/languages');

            if (!response.ok) {
                throw new Error('Failed to fetch languages');
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching languages:', error);
            showNotification('Error loading languages', 'error');
            return [];
        }
    }

    async function updateConfig(config) {
        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update configuration');
            }

            return await response.json();
        } catch (error) {
            console.error('Error updating config:', error);
            showNotification(error.message, 'error');
            return null;
        }
    }

    async function reloadService() {
        try {
            const response = await fetch('/api/reload', {
                method: 'POST'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to reload service');
            }

            return await response.json();
        } catch (error) {
            console.error('Error reloading service:', error);
            showNotification(error.message, 'error');
            return null;
        }
    }

    async function restartService() {
        try {
            const response = await fetch('/api/restart', {
                method: 'POST'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to restart service');
            }

            return await response.json();
        } catch (error) {
            console.error('Error restarting service:', error);
            showNotification(error.message, 'error');
            return null;
        }
    }

    async function executeCommand(command) {
        try {
            const response = await fetch('/api/command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ command })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Command execution failed');
            }

            return await response.json();
        } catch (error) {
            console.error('Error executing command:', error);
            showNotification(error.message, 'error');
            return null;
        }
    }

    // UI functions
    function updateStatus(config) {
        const statusIndicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');
        const protectionStatus = document.getElementById('protection-status');
        const expirationStatus = document.getElementById('expiration-status');
        const lastUpdated = document.getElementById('last-updated');
        const updateMode = document.getElementById('update-mode');
        const protectionMode = document.getElementById('protection-mode');

        if (!config || !config.basic) {
            statusIndicator.className = '';
            statusText.textContent = 'Error loading status';
            return;
        }

        const basic = config.basic;

        if (basic.disable === 'false') {
            statusIndicator.className = 'status-active';
            statusText.textContent = 'Active';
            protectionStatus.textContent = 'Enabled';
            protectionStatus.style.color = '#27ae60';
        } else {
            statusIndicator.className = '';
            statusText.textContent = 'Disabled';
            protectionStatus.textContent = 'Disabled';
            protectionStatus.style.color = '#e74c3c';
        }

        // 仅显示最后更新时间
        lastUpdated.textContent = new Date(parseInt(basic.timestamp) * 1000).toLocaleString();
        updateMode.textContent = basic.update === 'enable' ? 'Enabled' : 'Disabled';
        protectionMode.textContent = basic.mode || 'Permissive';
    }

    // 新增: 更新统计信息
    function updateStats(stats) {
        const protectionCount = document.getElementById('protection-count');
        const expirationStatus = document.getElementById('expiration-status');

        // 更新保护次数
        protectionCount.textContent = stats.protection_count;

        // 更新剩余时间或默认禁用时长
        if (stats.remaining_time) {
            expirationStatus.textContent = stats.remaining_time;
            expirationStatus.style.color = '#e74c3c'; // 红色表示禁用状态
        } else {
            expirationStatus.textContent = currentConfig.basic.expire_hours + ' hours (default)';
            expirationStatus.style.color = '#27ae60'; // 绿色表示启用状态
        }
    }

    function loadConfigToForm(config) {
        if (!config || !config.basic) return;

        const basic = config.basic;

        document.getElementById('language').value = basic.language || '';
        document.getElementById('disable').value = basic.disable || 'false';
        document.getElementById('expire_hours').value = basic.expire_hours || '24';
        document.getElementById('update').value = basic.update || 'enable';
        document.getElementById('mode').value = basic.mode || 'Permissive';
        document.getElementById('web_ip').value = basic.web_ip || '127.0.0.1';
        document.getElementById('web_port').value = basic.web_port || '8080';
    }

    function loadRulesToForm(config) {
        if (!config) return;

        const protectedPaths = document.getElementById('protected-paths');
        const commandRules = document.getElementById('command-rules');

        if (config.protected_paths) {
            protectedPaths.value = config.protected_paths.join('\n');
        }

        if (config.command_rules) {
            commandRules.value = config.command_rules.join('\n');
        }
    }

    function populateLanguageSelect(languages) {
        const select = document.getElementById('language');
        select.innerHTML = '';

        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.code;
            option.textContent = lang.name;
            select.appendChild(option);
        });

        fetchConfig().then(config => {
            if (config && config.basic && config.basic.language) {
                select.value = config.basic.language;
            }
        });
    }

    function showNotification(message, type = 'success') {
        alert(`${type.toUpperCase()}: ${message}`);
    }

    // Initialize dashboard
    async function initDashboard() {
        currentConfig = await fetchConfig();
        updateStatus(currentConfig);

        // 获取并更新统计信息
        const stats = await fetchStats();
        if (stats) {
            updateStats(stats);
        }
    }

    // 其他初始化函数保持不变...

    // 定期刷新仪表盘
    setInterval(async () => {
        if (document.getElementById('dashboard').classList.contains('active')) {
            const stats = await fetchStats();
            if (stats) {
                updateStats(stats);
            }
        }
    }, 5000); // 每5秒刷新一次

    // 初始化所有页面
    initDashboard();
    initConfigPage();
    initRulesPage();
    initLogsPage();
    initToolsPage();

    // Setup action buttons
    document.getElementById('reload-btn').addEventListener('click', async function() {
        const result = await reloadService();
        if (result) {
            showNotification('Configuration reloaded');
            initDashboard(); // Refresh status
        }
    });

    document.getElementById('restart-btn').addEventListener('click', async function() {
        const result = await restartService();
        if (result) {
            showNotification('Service restarted');
            initDashboard(); // Refresh status
        }
    });
	// 在文件末尾添加以下函数实现
function initConfigPage() {
    // 获取语言列表并填充下拉框
    fetchLanguages().then(languages => {
        populateLanguageSelect(languages);
    });

    // 加载配置到表单
    fetchConfig().then(config => {
        loadConfigToForm(config);
    });

    // 保存配置按钮事件
    document.getElementById('save-config').addEventListener('click', async function() {
        const basic = {
            language: document.getElementById('language').value,
            disable: document.getElementById('disable').value,
            expire_hours: document.getElementById('expire_hours').value,
            update: document.getElementById('update').value,
            mode: document.getElementById('mode').value,
            web_ip: document.getElementById('web_ip').value,
            web_port: document.getElementById('web_port').value
        };

        const configData = {
            basic: basic
        };

        const result = await updateConfig(configData);
        if (result) {
            showNotification('Configuration saved');
            // 更新当前配置
            currentConfig = await fetchConfig();
            updateStatus(currentConfig);
        }
    });
}

// 规则页面初始化
function initRulesPage() {
    fetchConfig().then(config => {
        loadRulesToForm(config);
    });

    // 保存规则按钮事件
    document.getElementById('save-rules').addEventListener('click', async function() {
        const protectedPaths = document.getElementById('protected-paths').value.split('\n');
        const commandRules = document.getElementById('command-rules').value.split('\n');

        const configData = {
            protected_paths: protectedPaths,
            command_rules: commandRules
        };

        const result = await updateConfig(configData);
        if (result) {
            showNotification('Rules saved');
        }
    });
}

// 日志页面初始化
function initLogsPage() {
    const logOutput = document.getElementById('log-output');
    const pauseBtn = document.getElementById('pause-logs');
    const clearBtn = document.getElementById('clear-logs');
    let paused = false;

    // 日志流
    const eventSource = new EventSource('/api/logs');

    eventSource.onmessage = function(event) {
        if (paused) return;

        if (event.data) {
            logOutput.textContent += event.data + '\n';
            // 自动滚动到底部
            logOutput.scrollTop = logOutput.scrollHeight;
        }
    };

    eventSource.onerror = function(err) {
        console.error('EventSource error:', err);
        eventSource.close();
    };

    pauseBtn.addEventListener('click', function() {
        paused = !paused;
        this.textContent = paused ? 'Resume' : 'Pause';
    });

    clearBtn.addEventListener('click', function() {
        logOutput.textContent = '';
    });
}

// 工具页面初始化
function initToolsPage() {
    const commandInput = document.getElementById('command');
    const executeBtn = document.getElementById('execute-btn');
    const commandOutput = document.getElementById('command-output');

    executeBtn.addEventListener('click', async function() {
        if (!commandInput.value.trim()) return;

        const result = await executeCommand(commandInput.value);
        if (result) {
            commandOutput.textContent = result.output;
        }
    });

    commandInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            executeBtn.click();
        }
    });
}
});
