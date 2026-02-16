# Raspberry Pi Deployment Guide
## Roth IRA ML Finance Bot

This guide covers deploying the ML-enhanced finance bot to a Raspberry Pi for 24/7 automated trading.

---

## System Requirements

- **Hardware:** Raspberry Pi 4B (4GB RAM minimum) or newer
- **OS:** Raspberry Pi OS (Bullseye or newer)
- **Internet:** Stable ethernet or WiFi connection
- **Disk:** 2GB free space (after OS)

### Optional Hardware
- UPS (for continuous operation)
- External SSD (faster boot, longer lifespan)

---

## Step 1: Initial Raspberry Pi Setup

```bash
# 1. Flash Raspberry Pi OS (without desktop for smaller footprint)
# Use Raspberry Pi Imager:
# - Select "Raspberry Pi OS (64-bit) Lite"
# - Enable SSH in Imager settings
# - Set password

# 2. Update system
ssh pi@raspberrypi.local

sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-pip python3-venv build-essential libcurl4-openssl-dev

# 3. Expand filesystem (optional, if using SD card)
sudo raspi-config  # Advance Options > Expand Filesystem > Reboot
```

---

## Step 2: Deploy ML Bot

```bash
# Clone or copy project to Raspberry Pi
cd ~
git clone <repo-url> roth-bot
# OR
scp -r Personal\ Projects pi@raspberrypi.local:~/roth-bot/

ssh pi@raspberrypi.local

# 2. Install Python dependencies (use --only-binary for ARM)
cd ~/roth-bot/ml_model
pip3 install --only-binary :all: -r requirements.txt

# This takes 5-10 minutes on Pi. Grab coffee.
```

---

## Step 3: Build C++ Bot

```bash
cd ~/roth-bot

# Compile
make -f Makefile-ML Roth-IRA-ML

# Verify build
ls -la Roth-IRA-ML
./Roth-IRA-ML --help  # Won't work yet, but checks compilation
```

---

## Step 4: Configure Environment

```bash
# Copy config template
cp config.env.example config.env

# Edit config
nano config.env

# Key settings:
# - ALPHAVANTAGE_API_KEY: Your API key (or leave fallback)
# - ML_CONFIDENCE_THRESHOLD: 0.65 (balanced) or 0.75 (conservative)
# - WATCHLIST: Stocks to monitor

# Test manually first
source config.env
./Roth-IRA-ML
```

---

## Step 5: Enable Auto-Start (Systemd Service)

### Option A: Simple Cron Schedule (Recommended for Testing)

```bash
# Edit crontab
crontab -e

# Add line to run bot every day at market open (9:30 AM EST)
# Convert to your timezone!
30 14 * * 1-5 /home/pi/roth-bot/Roth-IRA-ML >> /home/pi/roth-bot/bot.log 2>&1
```

**Crontab Timezone Help:**
- 14:30 UTC = 9:30 AM EDT (Eastern)
- 13:30 UTC = 9:30 AM CDT (Central)
- Adjust for your location

### Option B: Systemd Service (For Continuous Monitoring)

```bash
# Copy service template
sudo cp ~/roth-bot/roth-bot.service /etc/systemd/system/

# Edit if needed (paths, user, environment)
sudo nano /etc/systemd/system/roth-bot.service

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable roth-bot.service
sudo systemctl start roth-bot.service

# Check status
sudo systemctl status roth-bot.service

# View logs
sudo journalctl -u roth-bot.service -f
```

---

## Step 6: Monitor & Maintain

### Check Trade Log

```bash
tail -n 20 ~/roth-bot/portfolio_log.csv
```

### View Bot Logs

```bash
# If using systemd
sudo journalctl -u roth-bot.service --since "2 hours ago"

# If using cron
tail -n 50 ~/roth-bot/bot.log
```

### Retrain Model (Monthly)

```bash
cd ~/roth-bot/ml_model
python3 data_collector.py
python3 train_model.py
```

---

## Performance Optimization

### 1. Reduce Model Size

**Current:** stock_classifier.pkl (~2 MB)

To quantize and compress:

```bash
cd ~/roth-bot/ml_model
python3 << 'EOF'
import joblib
import sklearn

# Load original model
model = joblib.load('models/stock_classifier.pkl')

# Save with compression
joblib.dump(model, 'models/stock_classifier_compressed.pkl', compress=3)

# Check size
import os
orig = os.path.getsize('models/stock_classifier.pkl')
comp = os.path.getsize('models/stock_classifier_compressed.pkl')
print(f"Original: {orig/1024}KB → Compressed: {comp/1024}KB ({100*comp/orig:.1f}%)")
EOF
```

### 2. Pre-Cache Features

Before deploying, generate feature cache to avoid repeated calculations:

```bash
python3 << 'EOF'
import pickle
from data_collector import download_historical_data, create_features

# Cache features for watchlist
tickers = ["VOO", "AAPL", "MSFT"]
cache = {}
for ticker in tickers:
    df = download_historical_data(ticker, period="1mo")
    cache[ticker] = df.iloc[-1].to_dict()

with open('models/feature_cache.pkl', 'wb') as f:
    pickle.dump(cache, f)
EOF
```

### 3. Disable Unnecessary Logging

In `Roth-IRA-ML.cpp`, comment out verbose output for production:

```cpp
// std::cout << "  [ML] " << ticker << "..." << std::endl;
```

### 4. Reduce API Calls

Modify watchlist to only high-conviction stocks:

```bash
# config.env
export WATCHLIST="VOO,MSFT"  # Fewer tickers = faster execution
```

### 5. Limit Prediction Cache

Add local cache to avoid redundant ML predictions on same day:

```bash
# In predict.py (add this function)
def check_cache(ticker, cache_file='models/prediction_cache.json'):
    import json, datetime
    try:
        with open(cache_file) as f:
            cache = json.load(f)
        if cache.get(ticker, {}).get('date') == str(datetime.date.today()):
            return cache[ticker].get('prediction')
    except:
        pass
    return None
```

---

## Resource Monitoring

### Check Memory Usage

```bash
free -h
# Typical: bot uses 80-150MB

# Monitor during execution
watch -n 1 'free -h && ps aux | grep Roth-IRA-ML'
```

### Check CPU Usage

```bash
top -b -n 1 | grep Roth-IRA-ML
```

### Monitor Temperature

```bash
vcgencmd measure_temp
# Should stay below 80°C (Pi auto-throttles at 85°C)
```

---

## Troubleshooting

### Bot Crashes with "Python not found"

```bash
# Verify Python path
which python3

# Update bot script to full path
# Edit Roth-IRA-ML.cpp line ~65:
// std::string cmd = "/usr/bin/python3 ml_model/predict.py " + ticker + " 2>/dev/null";
```

### Model Files Missing After Boot

```bash
# Ensure paths are absolute in systemd service
WorkingDirectory=/home/pi/roth-bot
# Or use full path: /home/pi/roth-bot/ml_model/models/...
```

### API Rate Limit Errors

```bash
# Reduce watchlist size
# OR upgrade Alpha Vantage API plan
# OR increase delay between requests (in Roth-IRA-ML.cpp)
std::this_thread::sleep_for(std::chrono::seconds(20));  // was 15
```

### High Memory Usage

```bash
# Check for memory leaks
ps aux | grep Roth-IRA-ML

# Restart service
sudo systemctl restart roth-bot.service

# Check swap usage
free -h
```

---

## Advanced: Run with Docker (Optional)

For consistent environments across devices:

```dockerfile
# Dockerfile
FROM arm32v7/debian:bullseye

RUN apt-get update && apt-get install -y \
    python3 python3-pip build-essential libcurl4-openssl-dev

WORKDIR /app
COPY . .

RUN cd ml_model && pip3 install -r requirements.txt
RUN make -f Makefile-ML Roth-IRA-ML

CMD ["./Roth-IRA-ML"]
```

Build and run:

```bash
docker build -t roth-bot .
docker run -v ~/portfolio_log.csv:/app/portfolio_log.csv roth-bot
```

---

## Power Management

### Scheduled Shutdown/Wake

Use Raspberry Pi's GPIO pins with external relay to schedule power cycles:

```bash
# Shutdown at night (11 PM)
30 23 * * * sudo shutdown -h now

# Works with UPS: Pi wakes at market open via external timer
```

### Reduce Power Consumption

```bash
# Disable HDMI (if not using)
sudo /opt/vc/bin/tvservice -o

# Disable Bluetooth/WiFi if using Ethernet
echo "dtoverlay=disable-bt" | sudo tee -a /boot/config.txt
echo "dtoverlay=disable-wifi" | sudo tee -a /boot/config.txt
```

---

## Backup & Recovery

### Backup Portfolio Data

```bash
# Weekly backup to external storage
0 0 * * 0 cp ~/roth-bot/portfolio_log.csv ~/backups/portfolio_$(date +\%Y\%m\%d).csv
```

### Backup Trained Model

```bash
# Monthly model checkpoint
0 0 1 * * cp -r ~/roth-bot/ml_model/models ~/backups/models_$(date +\%Y\%m\%d)/
```

---

## Security Checklist

- [ ] Use environment variable for API key (not hardcoded)
- [ ] Enable SSH key-based auth (disable password SSH)
- [ ] Firewall: Allow only outbound HTTPS (port 443)
- [ ] Restrict portfolio_log.csv permissions: `chmod 600`
- [ ] Rotate API key quarterly
- [ ] Monitor for unusual trades: `tail portfolio_log.csv`

---

## Support & Logs

All logs are in:
- `/home/pi/roth-bot/portfolio_log.csv` - Trade history
- `/home/pi/roth-bot/bot.log` - stdout/stderr (if using cron)
- `systemctl logs` - If using systemd service

For debugging:

```bash
# Run with verbose output
cd ~/roth-bot && ./Roth-IRA-ML

# Check ML directly
cd ml_model && python3 predict.py AAPL

# Verify API connectivity
curl "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=YOUR_KEY"
```
