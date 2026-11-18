from flask import Flask, render_template_string
from action_group_controller import ActionGroupController
import threading
import time
import os

app = Flask(__name__)

# 动作组目录路径
ACTION_GROUP_DIR = "./ActionGroups/"

# 获取所有动作组文件（去掉.d6a后缀）并按首字母排序
def get_action_groups():
    try:
        if not os.path.exists(ACTION_GROUP_DIR):
            os.makedirs(ACTION_GROUP_DIR)
            return []
        actions = [f.split('.')[0] for f in os.listdir(ACTION_GROUP_DIR) if f.endswith('.d6a')]
        return sorted(actions, key=lambda x: x.lower())
    except Exception as e:
        print(f"读取动作组目录失败: {e}")
        return []

# 初始化机械臂控制器
try:
    controller = ActionGroupController()
except Exception as e:
    print(f"控制器初始化失败 (测试模式可能忽略): {e}")
    # 创建一个伪造的controller用于测试界面（如果硬件未连接）
    class MockController:
        def runAction(self, name): print(f"Mock Run: {name}")
    controller = MockController()

# 动作组执行函数
def run_action(action_name):
    try:
        print(f"执行动作组: {action_name}")
        controller.runAction(action_name)
        # 注意：这里的sleep只是为了防止命令发送太快，实际动作时间可能更长
        time.sleep(0.5) 
    except Exception as e:
        print(f"执行错误: {str(e)}")

# 网页界面 - 现代科技工业风格
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>ARM CONTROL CENTER</title>
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        :root {
            /* 配色方案：现代工业风 */
            --bg-color: #f0f2f5;
            --surface-color: #ffffff;
            --primary-color: #ff6b00; /* 活力橙 */
            --primary-dark: #e65100;
            --primary-light: #fff0e0;
            --text-main: #2d3436;
            --text-sub: #636e72;
            --border-color: #dfe6e9;
            --shadow-sm: 0 2px 8px rgba(0,0,0,0.04);
            --shadow-md: 0 8px 24px rgba(0,0,0,0.08);
            --radius-lg: 16px;
            --radius-md: 12px;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        
        body {
            font-family: 'Noto Sans SC', 'Rajdhani', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            line-height: 1.5;
            padding-bottom: 100px; /* 为底部状态栏留出空间 */
        }

        /* 顶部导航 */
        header {
            background: var(--surface-color);
            padding: 20px;
            box-shadow: var(--shadow-sm);
            position: sticky;
            top: 0;
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .brand-icon {
            width: 36px;
            height: 36px;
            background: var(--primary-color);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }

        .brand-text h1 {
            font-family: 'Rajdhani', sans-serif;
            font-size: 1.4rem;
            font-weight: 700;
            letter-spacing: 0.5px;
            line-height: 1.1;
        }

        .brand-text p {
            font-size: 0.75rem;
            color: var(--text-sub);
        }

        /* 主容器 */
        .container {
            max-width: 1000px;
            margin: 24px auto;
            padding: 0 16px;
        }

        /* 卡片通用样式 */
        .card {
            background: var(--surface-color);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-sm);
            margin-bottom: 24px;
            overflow: hidden;
            border: 1px solid var(--border-color);
        }

        .card-header {
            padding: 16px 24px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            gap: 10px;
            background: rgba(255,255,255,0.5);
            backdrop-filter: blur(5px);
        }

        .card-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .card-title::before {
            content: '';
            display: block;
            width: 4px;
            height: 18px;
            background: var(--primary-color);
            border-radius: 2px;
        }

        .card-body {
            padding: 24px;
        }

        /* 按钮网格 */
        .action-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 16px;
        }

        /* 按钮样式 */
        .btn {
            border: none;
            background: var(--bg-color);
            color: var(--text-main);
            padding: 16px 12px;
            border-radius: var(--radius-md);
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            min-height: 80px;
            border: 2px solid transparent;
            box-shadow: 0 2px 0 rgba(0,0,0,0.05);
        }

        .btn:hover {
            transform: translateY(-2px);
            background: white;
            border-color: var(--primary-color);
            color: var(--primary-color);
            box-shadow: 0 4px 12px rgba(255, 107, 0, 0.15);
        }

        .btn:active {
            transform: translateY(1px);
            background: var(--primary-light);
        }

        /* 特殊按钮：初始化 */
        .btn-init {
            grid-column: 1 / -1; /* 占满整行 */
            background: linear-gradient(135deg, #ff8c42 0%, #ff6b00 100%);
            color: white;
            flex-direction: row;
            gap: 12px;
            font-size: 1.1rem;
            letter-spacing: 1px;
            min-height: 64px;
            box-shadow: 0 4px 15px rgba(255, 107, 0, 0.3);
        }

        .btn-init:hover {
            background: linear-gradient(135deg, #ff9f63 0%, #ff7d26 100%);
            color: white;
            border-color: transparent;
            transform: translateY(-2px);
        }
        
        .btn-init svg {
            width: 24px;
            height: 24px;
            fill: white;
        }

        /* 分类标签 */
        .group-label {
            grid-column: 1 / -1;
            font-size: 0.85rem;
            font-weight: 700;
            color: var(--text-sub);
            margin-top: 8px;
            margin-bottom: -8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .group-label::after {
            content: '';
            height: 1px;
            flex: 1;
            background: var(--border-color);
        }

        /* 底部悬浮状态栏 */
        .status-bar {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            width: 90%;
            max-width: 600px;
            background: rgba(30, 30, 40, 0.95);
            backdrop-filter: blur(10px);
            padding: 12px 20px;
            border-radius: 50px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            color: white;
            z-index: 1000;
            transition: all 0.3s;
        }

        .status-icon {
            width: 10px;
            height: 10px;
            background: #4cd137;
            border-radius: 50%;
            box-shadow: 0 0 10px #4cd137;
            margin-right: 12px;
            animation: pulse 2s infinite;
        }

        .status-content {
            flex: 1;
            font-family: 'Rajdhani', monospace;
            font-size: 1rem;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .status-label {
            font-size: 0.75rem;
            color: #aaa;
            margin-right: 8px;
        }

        /* 动画 */
        @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(0.9); }
            100% { opacity: 1; transform: scale(1); }
        }

        @keyframes slideUp {
            from { transform: translate(-50%, 100%); opacity: 0; }
            to { transform: translate(-50%, 0); opacity: 1; }
        }

        /* 响应式适配 */
        @media (max-width: 600px) {
            .action-grid {
                grid-template-columns: repeat(2, 1fr); /* 手机上固定两列 */
            }
            .card-body {
                padding: 16px;
            }
            .btn {
                min-height: 70px;
                font-size: 0.9rem;
            }
        }
    </style>
</head>
<body>
    
    <header>
        <div class="brand">
            <div class="brand-icon">
                <!-- 简单的机械臂SVG图标 -->
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44A.991.991 0 013 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9zM12 4.15L6.04 7.5 12 10.85l5.96-3.35L12 4.15z"/>
                </svg>
            </div>
            <div class="brand-text">
                <h1>ARM CONTROL</h1>
                <p>Robot Action Interface</p>
            </div>
        </div>
    </header>

    <div class="container">
        
        <!-- 常用控制区 -->
        <div class="card">
            <div class="card-header">
                <div class="card-title">快捷指令 / Quick Access</div>
            </div>
            <div class="card-body">
                <div class="action-grid">
                    <!-- 初始化按钮 -->
                    <button class="btn btn-init" onclick="runAction('init')">
                        <svg viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                        </svg>
                        系统复位 (INIT)
                    </button>
                    
                    <!-- 其他常用动作 (示例) -->
                    {% for action in common_actions if action != 'init' %}
                    <button class="btn" onclick="runAction('{{ action }}')">
                        {{ action }}
                    </button>
                    {% endfor %}
                </div>
            </div>
        </div>

        <!-- 所有动作区 -->
        <div class="card">
            <div class="card-header">
                <div class="card-title">动作组库 / Library</div>
            </div>
            <div class="card-body">
                <div class="action-grid">
                    {% for letter, actions in grouped_actions.items() %}
                    
                    <!-- 字母分割线 -->
                    <div class="group-label">{{ letter }} Series</div>
                    
                    {% for action in actions %}
                    <button class="btn" onclick="runAction('{{ action }}')">
                        {{ action }}
                    </button>
                    {% endfor %}
                    
                    {% endfor %}
                    
                    {% if not grouped_actions %}
                    <div style="grid-column: 1/-1; text-align: center; color: #999; padding: 20px;">
                        暂无动作组文件
                    </div>
                    {% endif %}
                </div>
            </div>
        </div>

    </div>

    <!-- 底部悬浮状态栏 -->
    <div class="status-bar" id="statusBar">
        <div class="status-icon" id="statusLight"></div>
        <div class="status-content">
            <span class="status-label">STATUS:</span>
            <span id="statusText">READY / 等待指令</span>
        </div>
    </div>

    <script>
    let clearStatusTimer;

    function runAction(actionName) {
        const statusText = document.getElementById('statusText');
        const statusLight = document.getElementById('statusLight');
        const statusBar = document.getElementById('statusBar');

        // 更新UI状态
        statusText.innerText = 'EXECUTING: ' + actionName.toUpperCase();
        statusLight.style.background = '#ffaa00'; // 执行中变橙色
        statusLight.style.boxShadow = '0 0 15px #ffaa00';
        
        // 简单的按下动画反馈
        statusBar.style.transform = 'translateX(-50%) scale(1.05)';
        setTimeout(() => {
            statusBar.style.transform = 'translateX(-50%) scale(1)';
        }, 100);

        fetch('/run/' + actionName)
            .then(response => response.text())
            .then(data => {
                // 稍微延迟显示完成，避免闪烁太快
                setTimeout(() => {
                    statusText.innerText = 'COMPLETED: ' + actionName.toUpperCase();
                    statusLight.style.background = '#4cd137'; // 完成变绿
                    statusLight.style.boxShadow = '0 0 10px #4cd137';
                }, 500);
                
                // 3秒后恢复待机显示
                clearTimeout(clearStatusTimer);
                clearStatusTimer = setTimeout(() => {
                    statusText.innerText = 'READY / 等待指令';
                }, 3000);
            })
            .catch(error => {
                statusText.innerText = 'ERROR: ' + error;
                statusLight.style.background = '#ff4757'; // 错误变红
                statusLight.style.boxShadow = '0 0 15px #ff4757';
            });
    }
    
    // 页面加载动画
    document.addEventListener("DOMContentLoaded", function() {
        const statusBar = document.getElementById('statusBar');
        statusBar.style.animation = "slideUp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards";
    });
    </script>
</body>
</html>
"""

@app.route('/')
def control_panel():
    all_actions = get_action_groups()
    
    # 定义常用动作，方便置顶显示
    common_actions = ['init','garbage_pick_init','navigation_pick_init','navigation_pick','navigation_place'] 
    
    # 过滤掉已在常用列表中显示的动作，避免重复(可选，这里保留重复以展示分组功能)
    # remaining_actions = [a for a in all_actions if a not in common_actions]
    
    # 按首字母分组
    grouped_actions = {}
    for action in all_actions:
        # 过滤掉 init，因为它已经在上面有一个大按钮了
        if action == 'init':
            continue
            
        first_letter = action[0].upper() if action else '?'
        if first_letter not in grouped_actions:
            grouped_actions[first_letter] = []
        grouped_actions[first_letter].append(action)
    
    # 字典排序
    grouped_actions = dict(sorted(grouped_actions.items()))
    
    return render_template_string(
        HTML_TEMPLATE, 
        grouped_actions=grouped_actions,
        common_actions=common_actions
    )

@app.route('/run/<action_name>')
def execute_action(action_name):
    threading.Thread(target=run_action, args=(action_name,)).start()
    return f"Running: {action_name}"

if __name__ == '__main__':
    # 启动时自动复位
    threading.Thread(target=run_action, args=('init',)).start()
    
    # 启动 Flask
    app.run(host='0.0.0.0', port=5000, debug=False)
