# CICO SSO API - Network Troubleshooting Guide
## Untuk IT/DevOps Team CurCol

---

## 🔴 **MASALAH:**
CurCol tidak bisa resolve domain `workspace.joniiswa1101.repl.co`

---

## ✅ **INFORMASI SERVER CICO**

```
API Base URL: https://workspace.joniiswa1101.repl.co
Hosting: Replit (repl.it cloud platform)
Port: 443 (HTTPS)
Protocol: HTTPS/TLS 1.2+
```

---

## 🔍 **TROUBLESHOOTING STEPS**

### **Step 1: Test DNS Resolution**

Jalankan dari CurCol server:
```bash
# Test DNS resolution
nslookup workspace.joniiswa1101.repl.co
dig workspace.joniiswa1101.repl.co

# Test ping (ICMP)
ping workspace.joniiswa1101.repl.co

# Test curl
curl -v https://workspace.joniiswa1101.repl.co/api/server-time
```

### **Step 2: Check Firewall Rules**

Pastikan firewall CurCol allow:
```
Domain: workspace.joniiswa1101.repl.co
Port: 443 (HTTPS)
Direction: OUTBOUND
Protocol: TCP

Whitelist rule:
- Allow HTTPS to workspace.joniiswa1101.repl.co:443
```

### **Step 3: Check Proxy Settings**

Jika ada corporate proxy:
```bash
# Test dengan proxy
curl -v -x [proxy-server]:[port] \
  https://workspace.joniiswa1101.repl.co/api/server-time

# atau set environment variables
export https_proxy=http://proxy:port
export http_proxy=http://proxy:port
```

### **Step 4: Check DNS Servers**

```bash
# Check DNS config
cat /etc/resolv.conf

# Test dengan public DNS
nslookup workspace.joniiswa1101.repl.co 8.8.8.8
nslookup workspace.joniiswa1101.repl.co 1.1.1.1
```

---

## 📋 **CHECKLIST untuk IT CurCol**

- [ ] DNS resolution work? `nslookup workspace.joniiswa1101.repl.co`
- [ ] Firewall allow outbound 443? `telnet workspace.joniiswa1101.repl.co 443`
- [ ] Proxy configured? Check `echo $https_proxy`
- [ ] SSL/TLS certificates valid? Test dengan `curl -v`
- [ ] Application firewall / WAF not blocking? Check logs

---

## 🔧 **SOLUTION OPTIONS**

### **Option A: Domain Whitelist (RECOMMENDED)**
- Whitelist domain: `workspace.joniiswa1101.repl.co`
- **Pros:** Simple, automatic updates
- **Cons:** Requires DNS resolution

### **Option B: IP Whitelist**
- **TIDAK POSSIBLE** dengan Replit
- Replit menggunakan shared infrastructure dengan dynamic IPs
- IP bisa berubah setiap saat
- **Not recommended**

### **Option C: VPN/Tunnel Setup**
Jika network CurCol sangat terisolasi:
- Setup VPN tunnel ke CICO
- Setup reverse proxy
- Setup bastion host jump
- Contact: CICO team + CurCol team untuk coordination

### **Option D: API Gateway / Load Balancer**
Jika ingin custom domain atau static IP:
- CurCol setup API Gateway (AWS, Azure, dll)
- Gateway point ke CICO domain
- Clients call gateway instead
- **Requires:** Additional infrastructure

---

## 📞 **SUPPORT**

**Jika masih error:**

1. Jalankan diagnostic commands di atas
2. Share output ke CICO team
3. CurCol IT + CICO team debug bersama

**Contact:**
- CICO Team: [contact info]
- Replit Support: https://replit.com/support

---

## 🚀 **QUICK REFERENCE**

| Check | Command | Expected Result |
|-------|---------|-----------------|
| DNS | `nslookup workspace.joniiswa1101.repl.co` | IP address returned |
| Ping | `ping workspace.joniiswa1101.repl.co` | ICMP replies OK |
| HTTPS | `curl https://workspace.joniiswa1101.repl.co/api/server-time` | JSON response |
| Port 443 | `telnet workspace.joniiswa1101.repl.co 443` | Connected |
| Cert | `openssl s_client -connect workspace.joniiswa1101.repl.co:443` | Valid certificate |

---

**Document Date:** 17 Maret 2026  
**Status:** Ready for IT Team
