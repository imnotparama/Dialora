# Deploying Dialora to Production

Because Dialora relies heavily on deep system-level integrations (Asterisk telephony, Ollama LLM, WebSockets, and local Audio rendering), **the backend cannot be deployed to Serverless platforms like Vercel**.

Instead, Dialora uses a **Hybrid Deployment** strategy:
1. **Frontend**: Vercel or Netlify (Fast, global CDN, perfect for Vite/React web apps).
2. **Backend**: A dedicated Linux Virtual Private Server (VPS) (e.g., DigitalOcean, AWS EC2, Hetzner, Linode).

---

## Part 1: Deploying the Backend (Linux VPS)

You will need a Linux VPS (Ubuntu 22.04 LTS or newer) with at least 8GB to 16GB of RAM (for Ollama Llama 3.2 execution).

### 1. Initial Server Setup & Dependencies
SSH into your server and install the core dependencies:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-pip python3-venv git asterisk ffmpeg
```

### 2. Install Ollama & Llama 3.2
Ollama must run as a background service to provide the AI logic.
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama run llama3.2
```

### 3. Setup the Dialora Backend
Clone the repository and set up the Python environment:
```bash
git clone https://github.com/imnotparama/Dialora.git
cd Dialora/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Configure Asterisk (PBX Engine)
Asterisk requires the Python AGI (Asterisk Gateway Interface) script to run during out-bound auto-dials.

1. Create a `dialora` sounds directory:
```bash
sudo mkdir -p /var/lib/asterisk/sounds/dialora
sudo chmod 777 /var/lib/asterisk/sounds/dialora
```

2. Copy the AGI script to the Asterisk directory:
```bash
sudo cp dialora_agent.agi /var/lib/asterisk/agi-bin/
sudo chmod +x /var/lib/asterisk/agi-bin/dialora_agent.agi
```

3. Update your `/etc/asterisk/extensions.conf` to hook into the AGI script:
```ini
[dialora-outbound]
exten => start,1,Answer()
exten => start,n,AGI(dialora_agent.agi)
exten => start,n,Hangup()
```

### 5. Run the FastAPI Backend as a Service
You should use `systemd` to keep the backend running 24/7.
Create a service file: `sudo nano /etc/systemd/system/dialora.service`

```ini
[Unit]
Description=Dialora FastAPI Backend
After=network.target

[Service]
User=root
WorkingDirectory=/root/Dialora/backend
Environment="PATH=/root/Dialora/backend/venv/bin"
ExecStart=/root/Dialora/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000

[Install]
WantedBy=multi-user.target
```

Start the service:
```bash
sudo systemctl enable dialora
sudo systemctl start dialora
```

*(Note: Depending on your domain setup, you should place an Nginx reverse proxy in front of Uvicorn to provide SSL/HTTPS. Browsers require HTTPS for microphone WebRTC access).*

---

## Part 2: Deploying the Frontend (Vercel)

The React dashboard is easily hosted on Vercel.

1. **Push to GitHub**: Ensure your latest code is pushed to your GitHub repository.
2. **Log into Vercel**: Connect your GitHub account at [vercel.com](https://vercel.com).
3. **Import Project**: Select the `Dialora` repository.
4. **Configure Project**:
   * **Framework Preset**: Vite
   * **Root Directory**: `frontend`
5. **Environment Variables**:
   In the Vercel dashboard, add the following environment variable so the frontend knows where your VPS is located:
   * **Name**: `VITE_BACKEND_URL`
   * **Value**: `http://<YOUR_VPS_IP_ADDRESS>:8000` *(or your https domain if you configured Nginx)*
6. **Deploy**: Click Deploy! 

Your frontend will now be globally available, while securely communicating over WebSockets and REST APIs to your secure, dedicated AI backend.
