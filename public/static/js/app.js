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
                body: JSON.stringify({
                    command
                })
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

        lastUpdated.textContent = new Date(parseInt(basic.timestamp) * 1000).toLocaleString();
        updateMode.textContent = basic.update === 'enable' ? 'Enabled' : 'Disabled';
        protectionMode.textContent = basic.mode || 'Permissive';
    }

    function updateStats(stats) {
        const protectionCount = document.getElementById('protection-count');
        const expirationStatus = document.getElementById('expiration-status');

        protectionCount.textContent = stats.protection_count;

        if (stats.remaining_time) {
            expirationStatus.textContent = stats.remaining_time;
            expirationStatus.style.color = '#e74c3c';
        } else {
            expirationStatus.textContent = currentConfig.basic.expire_hours + ' hours (default)';
            expirationStatus.style.color = '#27ae60';
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

        // 清空现有表格数据
        document.getElementById('protectedPathsBody').innerHTML = '';
        document.getElementById('commandRulesBody').innerHTML = '';

        // 加载保护路径
        if (config.protected_paths) {
            config.protected_paths.forEach((path, index) => {
                if (!path) return;

                const row = document.createElement('tr');
                row.innerHTML = `
                <td class="number-cell">${index + 1}.</td>
                <td class="path-cell">
                    <input type="text" class="path-input confirmed" value="${path}" readonly>
                </td>
                <td class="action-cell">
                    <button class="action-btn remove-btn">Remove</button>
                </td>
            `;
                document.getElementById('protectedPathsBody').appendChild(row);
            });
        }

        // 添加一个空行用于新输入
        const emptyPathRow = document.createElement('tr');
        emptyPathRow.innerHTML = `
        <td class="number-cell">${(config.protected_paths?.length || 0) + 1}.</td>
        <td class="path-cell">
            <input type="text" class="path-input" placeholder="Enter a path rule">
        </td>
        <td class="action-cell">
            <button class="action-btn add-btn">Add</button>
        </td>
    `;
        document.getElementById('protectedPathsBody').appendChild(emptyPathRow);
        initProtectedPathsTable();

        // 加载命令拦截规则
        if (config.command_rules) {
            config.command_rules.forEach((rule, index) => {
                if (!rule) return;

                const [original, replacement] = rule.split('>').map(s => s.trim());

                const row = document.createElement('tr');
                row.classList.add('confirmed');
                row.innerHTML = `
                <td>${index + 1}</td>
                <td>
                    <input type="text" class="original-input" value="${original || ''}" readonly>
                </td>
                <td class="arrow-cell">></td>
                <td><input type="text" class="replace-input" value="${replacement || ''}" readonly></td>
                <td class="action-cell">
                    <button class="remove-btn">Remove</button>
                </td>
            `;
                document.getElementById('commandRulesBody').appendChild(row);
            });
        }

        // 添加一个空行用于新输入
        const emptyCommandRow = document.createElement('tr');
        emptyCommandRow.innerHTML = `
        <td>${(config.command_rules?.length || 0) + 1}</td>
        <td>
            <input type="text" class="original-input" placeholder="Original">
            <div class="error-message">Original cannot be empty</div>
        </td>
        <td class="arrow-cell">></td>
        <td><input type="text" class="replace-input" placeholder="Replace"></td>
        <td class="action-cell">
            <button class="add-btn">Add</button>
        </td>
    `;
        document.getElementById('commandRulesBody').appendChild(emptyCommandRow);
        initCommandRulesTable();
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

        const stats = await fetchStats();
        if (stats) {
            updateStats(stats);
        }
    }

    // 配置页面初始化
    function initConfigPage() {
        fetchLanguages().then(languages => {
            populateLanguageSelect(languages);
        });

        fetchConfig().then(config => {
            loadConfigToForm(config);
        });

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
                currentConfig = await fetchConfig();
                updateStatus(currentConfig);
            }
        });
    }

    // 规则页面初始化
    function initRulesPage() {
        // 初始化保护路径表格
        initProtectedPathsTable();

        // 初始化命令拦截规则表格
        initCommandRulesTable();

        // 加载配置到表格
        fetchConfig().then(config => {
            if (config) {
                loadRulesToForm(config);
            }
        });

        document.getElementById('save-rules').addEventListener('click', async function() {
            const protectedPaths = getProtectedPaths();
            const commandRules = getCommandRules();

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

    // 初始化保护路径表格
    function initProtectedPathsTable() {
        const tableBody = document.getElementById('protectedPathsBody');
        let rowCount = 1;

        // 设置行事件处理
        function setupRowEvents(row) {
            const input = row.querySelector('.path-input');
            const button = row.querySelector('.action-btn');

            // 按钮点击事件处理
            button.addEventListener('click', function() {
                const content = input.value.trim();

                if (button.classList.contains('add-btn')) {
                    // 处理Add操作
                    if (content) {
                        // 锁定输入框样式
                        input.classList.add('confirmed');
                        input.readOnly = true;

                        // 变为Remove按钮
                        button.classList.remove('add-btn');
                        button.classList.add('remove-btn');
                        button.textContent = 'Remove';

                        // 添加新行
                        addNewEmptyRow();
                    } else {
                        alert('Please enter a path rule before adding');
                    }
                } else {
                    // 处理Remove操作
                    row.remove();
                    updateRowNumbers();
                    if (!hasEmptyRow()) {
                        addNewEmptyRow();
                    }
                }
            });
        }

        // 检查是否有空行 (即等待输入的行)
        function hasEmptyRow() {
            return Array.from(tableBody.querySelectorAll('tr')).some(row => {
                const input = row.querySelector('.path-input');
                const button = row.querySelector('.action-btn');
                return !input.classList.contains('confirmed') &&
                    button.classList.contains('add-btn');
            });
        }

        // 创建新的空行
        function addNewEmptyRow() {
            const newRow = document.createElement('tr');
            const newRowNum = ++rowCount;

            // 序号单元格
            const numberCell = document.createElement('td');
            numberCell.className = 'number-cell';
            numberCell.textContent = `${newRowNum}.`;

            // 路径内容单元格
            const pathCell = document.createElement('td');
            pathCell.className = 'path-cell';
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'path-input';
            input.placeholder = 'Enter a path rule';
            pathCell.appendChild(input);

            // 操作单元格 (添加按钮)
            const actionCell = document.createElement('td');
            actionCell.className = 'action-cell';
            const button = document.createElement('button');
            button.className = 'action-btn add-btn';
            button.textContent = 'Add';
            actionCell.appendChild(button);

            // 组装行
            newRow.appendChild(numberCell);
            newRow.appendChild(pathCell);
            newRow.appendChild(actionCell);

            // 添加到表格容器
            tableBody.appendChild(newRow);

            // 绑定事件
            setupRowEvents(newRow);
        }

        // 更新行号函数
        function updateRowNumbers() {
            const rows = Array.from(tableBody.querySelectorAll('tr'));
            rowCount = rows.length;

            rows.forEach((row, index) => {
                const numberCell = row.querySelector('.number-cell');
                if (numberCell) {
                    numberCell.textContent = `${index + 1}.`;
                }
            });
        }

        // 设置初始行的监听器
        const initialRow = tableBody.querySelector('tr');
        if (initialRow) {
            setupRowEvents(initialRow);
        }
    }

    // 初始化命令拦截规则表格
    function initCommandRulesTable() {
        const tableBody = document.getElementById('commandRulesBody');

        // 重排行号
        function updateRowNumbers() {
            const rows = tableBody.querySelectorAll('tr');
            rows.forEach((row, idx) => {
                const numCell = row.querySelector('td');
                if (numCell) {
                    numCell.textContent = idx + 1;
                }
            });
        }

        // 检查是否存在空白 (即还没添加的)行
        function hasEmptyCommandRow() {
            const rows = tableBody.querySelectorAll('tr');
            for (const row of rows) {
                if (!row.classList.contains('confirmed')) {
                    return true;
                }
            }
            return false;
        }

        // 创建并绑定一个新的空行
        function addEmptyRow() {
            const index = tableBody.querySelectorAll('tr').length + 1;
            const row = document.createElement('tr');
            row.innerHTML = `
            <td>${index}</td>
            <td>
                <input type="text" class="original-input" placeholder="Original">
                <div class="error-message">Original cannot be empty</div>
            </td>
            <td class="arrow-cell">></td>
            <td><input type="text" class="replace-input" placeholder="Replace"></td>
            <td class="action-cell">
                <button class="add-btn">Add</button>
            </td>
        `;
            tableBody.appendChild(row);
            setupRowEvents(row);
        }

        // 设置单行事件
        function setupRowEvents(row) {
            const originalInput = row.querySelector('.original-input');
            const replaceInput = row.querySelector('.replace-input');
            const button = row.querySelector('button');
            const errorMessage = row.querySelector('.error-message');

            // 按钮点击事件处理 (Add / Remove)
            button.addEventListener('click', function() {
                if (button.classList.contains('add-btn')) {
                    // Add 操作
                    if (!originalInput.value.trim()) {
                        originalInput.classList.add('original-required');
                        errorMessage.style.display = 'block';
                        return;
                    }

                    // 锁定输入框并标记已确认
                    row.classList.add('confirmed');
                    originalInput.readOnly = true;
                    replaceInput.readOnly = true;

                    // 替换按钮状态
                    button.classList.remove('add-btn');
                    button.classList.add('remove-btn');
                    button.textContent = 'Remove';

                    // 添加新空行 (如果当前已经没有空行)
                    if (!hasEmptyCommandRow()) {
                        addEmptyRow();
                    }
                } else {
                    // Remove 操作
                    row.remove();
                    updateRowNumbers();
                    if (!hasEmptyCommandRow()) {
                        addEmptyRow();
                    }
                }
            });

            // 输入变化处理: 仅用于清除错误样式
            originalInput.addEventListener('input', function() {
                if (this.value.trim()) {
                    this.classList.remove('original-required');
                    errorMessage.style.display = 'none';
                }
            });
        }

        // 初始化已有行 (包括历史加载的 confirmed 规则)和确保有一个空行
        const existingRows = tableBody.querySelectorAll('tr');
        existingRows.forEach(r => {
            setupRowEvents(r);
        });
        if (!hasEmptyCommandRow()) {
            addEmptyRow();
        }
    }

    // 从保护路径表格获取数据
    function getProtectedPaths() {
        const paths = [];
        const rows = document.querySelectorAll('#protectedPathsBody tr');

        rows.forEach(row => {
            const input = row.querySelector('.path-input');
            if (input && input.value.trim()) {
                paths.push(input.value.trim());
            }
        });

        return paths;
    }

    // 从命令拦截规则表格获取数据
    function getCommandRules() {
        const rules = [];
        const rows = document.querySelectorAll('#commandRulesBody tr');

        rows.forEach(row => {
            const originalInput = row.querySelector('.original-input');
            const replaceInput = row.querySelector('.replace-input');

            if (originalInput && originalInput.value.trim()) {
                const original = originalInput.value.trim();
                const replacement = replaceInput.value.trim();
                // If replacement is empty, use '>' without duplicating original
                const rule = replacement ? `${original} > ${replacement}` : `${original} >`;
                rules.push(rule);
            }
        });

        return rules;
    }

    // 日志页面初始化
    function initLogsPage() {
        const logOutput = document.getElementById('log-output');
        const pauseBtn = document.getElementById('pause-logs');
        const clearBtn = document.getElementById('clear-logs');
        let paused = false;

        // 日志流 - 监听 "log" 事件
        const eventSource = new EventSource('/api/logs');

        eventSource.addEventListener('log', function(event) {
            if (paused) return;
            if (event.data) {
                logOutput.textContent += event.data + '\n';
                logOutput.scrollTop = logOutput.scrollHeight;

                // 显示新日志通知
                showLogNotification(event.data);
            }
        });

        // 添加日志通知函数
        function showLogNotification(message) {
            const container = document.getElementById('notificationContainer');

            // 如果容器不存在则创建
            if (!container) {
                const containerDiv = document.createElement('div');
                containerDiv.id = 'notificationContainer';
                containerDiv.className = 'notification-container';
                document.body.appendChild(containerDiv);
            }

            const notification = document.createElement('div');
            notification.className = 'notification msg';
            notification.innerHTML = `
        <div class="notification-content">${message}</div>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;

            document.getElementById('notificationContainer').appendChild(notification);

            // 添加动画类
            setTimeout(() => {
                notification.style.animation = 'slideIn 0.5s forwards, fadeOut 0.5s forwards 4.5s';
            }, 10);

            // 5秒后自动移除
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 5000);
        }

        eventSource.addEventListener('error', function(event) {
            logOutput.textContent += '[ERROR] ' + event.data + '\n';
            logOutput.scrollTop = logOutput.scrollHeight;
        });

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
        const toolsPage = document.getElementById('tools');

        // 创建并显示警告横幅
        function showWarningBanner() {
            // 检查横幅是否已存在
            if (document.querySelector('.warning-banner')) return;

            // 创建横幅元素
            const banner = document.createElement('div');
            banner.className = 'warning-banner blinking';
            banner.innerHTML = '<span>[ ! ] WARNING:This is the native shell.</span>';

            // 添加到页面
            document.body.prepend(banner);

            // 5秒后自动关闭
            setTimeout(() => {
                if (banner && banner.style.display !== 'none') {
                    banner.style.transition = 'opacity 0.5s ease';
                    banner.style.opacity = '0';
                    setTimeout(() => {
                        if (banner && banner.parentNode) {
                            banner.parentNode.removeChild(banner);
                        }
                    }, 500);
                }
            }, 5000);
        }

        // 监听Terminal页面激活状态变化
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.attributeName === 'class') {
                    if (toolsPage.classList.contains('active')) {
                        showWarningBanner();
                    }
                }
            });
        });

        // 观察页面是否被激活
        observer.observe(toolsPage, {
            attributes: true
        });

        // 初始加载时如果Terminal是激活状态, 显示横幅
        if (toolsPage.classList.contains('active')) {
            showWarningBanner();
        }

        // 原有命令执行逻辑保持不变
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

    // 定期刷新仪表盘
    setInterval(async () => {
        if (document.getElementById('dashboard').classList.contains('active')) {
            const stats = await fetchStats();
            if (stats) {
                updateStats(stats);
            }
        }
    }, 5000);

    // 初始化所有页面
    initDashboard();
    initConfigPage();
    initRulesPage();
    initLogsPage();
    initToolsPage();

    // 操作按钮
    document.getElementById('reload-btn').addEventListener('click', async function() {
        const result = await reloadService();
        if (result) {
            showNotification('Configuration reloaded');
            initDashboard();
        }
    });

    document.getElementById('restart-btn').addEventListener('click', async function() {
        const result = await restartService();
        if (result) {
            showNotification('Service restarted');
            initDashboard();
        }
    });
});
