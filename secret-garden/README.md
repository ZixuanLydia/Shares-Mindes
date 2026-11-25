# Secret Garden

NYU ITP Shared Minds 桌面端互动原型。将想法种成玻璃花，通过手势、俯视、语义关联、双色融合与时间回看探索作品。

## 运行

- macOS：双击 `outputs/Start Shared Garden.command`，保持终端开启。需要 Python 3。
- 其他系统／命令行：在项目根目录运行 `python3 server/shared_garden.py`，打开终端打印的本地地址（默认 `http://127.0.0.1:8851/`）。
- 可信局域网共享：`python3 server/shared_garden.py --host 0.0.0.0`，另一台电脑使用终端打印的 Wi-Fi 地址。
- 单人静态版：`python3 -m http.server 8000 --bind 127.0.0.1 --directory outputs`，打开 `http://127.0.0.1:8000/Secret%20Garden.html`。

保留 `outputs/body-assets` 和 `outputs/semantic-assets`。主机 localhost 支持摄像头；普通 HTTP 局域网访客使用鼠标。没有公网部署。

## 实现范围

真实技术包括程序三维花瓣、MediaPipe 本地手部追踪、多语言 MiniLM 句向量、语义相似度、JSON、localStorage、SQLite 与独立作者的局域网共享。联想词是明确标注的预设词，融合句是本地规则组合；没有生成式 AI、UMAP 或 Firebase。

作品持续保存在浏览器或 `server/data/garden.sqlite3`。请保留原数据库和浏览器身份。发行包不包含个人作品或会话。

## 构建与核查

修改 `work` 中源文件后运行 `python3 work/build-preview.py`，生成 `outputs/Secret Garden.html`。已有 Node 测试位于 `work/*qa.cjs`，后端测试从 `server` 目录运行 `python3 -B -m unittest test_shared_garden.py`。

逐项功能、测试结果、课程缺口及提交说明见 [V1 审核报告](<outputs/Secret Garden V1 Audit.md>)；操作细节见 [使用说明](outputs/使用与九周扩展.md)。
