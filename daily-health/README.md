<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Local services and database

```bash
# Postgres (PostGIS) and Redis
$ npm run services:up

# apply migrations
$ npm run db:migrate
```

## VPS-এ চালু করা (Deployment)

VPS-এ চালানোর সব ফাইল `deploy/` ফোল্ডারে (আর `Dockerfile` এই ফোল্ডারেই):

| ফাইল | কাজ |
|---|---|
| `Dockerfile` | API-র image |
| `deploy/docker-compose.prod.yml` | Postgres, Redis, migration, API আর Nginx |
| `deploy/nginx/api.conf.template` | HTTPS, upload-এর সীমা, Socket.io |
| `deploy/.env.production.example` | server-এর `.env`-এর নমুনা |
| `deploy/init-ssl.sh` | প্রথমবার চালু করা আর HTTPS সার্টিফিকেট নেওয়া |
| `deploy/backup-db.sh` | প্রতিদিনের DB backup |

বাইরে থেকে শুধু Nginx দেখা যায় (port 80 আর 443)। Database আর Redis শুধু Docker-এর ভেতরে থাকে।

---

### ০. শুরুর আগে যা লাগবে

1. **VPS:** Ubuntu 24.04 (বা 22.04)। কমপক্ষে ২ GB RAM, ভালো হয় ৪ GB। Disk কমপক্ষে ৪০ GB।
2. **Domain:** API-র জন্য একটা subdomain, যেমন `api.example.com`।
3. **GitHub-এ code:** VPS থেকে repo clone করা যায় এমন অনুমতি (নিচে ধাপ ৩)।
4. **Cloudflare R2-এ দুটো bucket:** একটা public (ছবি, logo), একটা **private, public access বন্ধ** (রিপোর্ট, প্রেসক্রিপশন)। দুটোর নাম আলাদা হতে হবে।

---

### ১. Domain-কে VPS-এ দেখানো

Domain-এর DNS-এ একটা **A record** যোগ করুন:

| Type | Name | Value |
|---|---|---|
| A | `api` | VPS-এর IP |

Cloudflare-এ DNS থাকলে প্রথমবার সার্টিফিকেট নেওয়া পর্যন্ত **Proxy বন্ধ রাখুন (ধূসর মেঘ, "DNS only")**।

কয়েক মিনিট পর আপনার কম্পিউটার থেকে যাচাই করুন:

```bash
nslookup api.example.com
```

উত্তরে VPS-এর IP এলে পরের ধাপে যান।

---

### ২. VPS প্রস্তুত করা

VPS-এ root হিসেবে SSH করুন, তারপর:

```bash
# সব update
apt update && apt upgrade -y

# আলাদা একটা user (root দিয়ে সব কাজ করবেন না)
adduser deploy
usermod -aG sudo deploy

# Firewall: শুধু SSH, HTTP, HTTPS
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable

# Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

এবার `exit` করে **`deploy` user হিসেবে আবার SSH করুন**, তারপর যাচাই করুন:

```bash
docker run --rm hello-world
```

---

### ৩. Code VPS-এ আনা

Repo private হলে VPS-এর জন্য একটা read-only deploy key বানান:

```bash
ssh-keygen -t ed25519 -C "daily-health-vps" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

যা দেখাবে, সেটা GitHub-এ repo → **Settings → Deploy keys → Add deploy key**-এ বসান। "Allow write access" বন্ধ রাখুন।

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
EOF

git clone git@github.com:alamin00006/daily-health.git ~/daily-health
cd ~/daily-health/daily-health/deploy
```

---

### ৪. Server-এর `.env` বানানো

```bash
cp .env.production.example .env
nano .env
```

যা যা বসাতে হবে:

- **`API_DOMAIN`**, **`LETSENCRYPT_EMAIL`**, আর যেখানে যেখানে `api.example.com` লেখা আছে সেখানে আপনার domain।
- **নতুন secret:** নিচের command দিয়ে বানিয়ে বসান। **আপনার কম্পিউটারের `.env`-এর key copy করবেন না।**
  ```bash
  openssl rand -base64 32                  # POSTGRES_PASSWORD, JWT_SECRET, OTP_HASH_SECRET (প্রতিটার জন্য আলাদা)
  echo "1:$(openssl rand -base64 32)"      # ENCRYPTION_KEYS
  ```
  `DATABASE_URL`-এর ভেতরেও একই `POSTGRES_PASSWORD` বসাতে হবে। পাসওয়ার্ডে `/`, `+` বা `=` থাকলে `openssl rand -hex 24` দিয়ে বানান, তাতে URL ভাঙবে না।
- **R2, Gmail, BulkSMSBD, shurjoPay, Agora:** এদের key আর password।
- **`APP_ENV`:** test server হলে `staging`, আসল ব্যবহারকারীদের জন্য `production`।

⚠️ **`ENCRYPTION_KEYS` হারালে রোগীর এনক্রিপ্ট করা তথ্য আর কখনো পড়া যাবে না।** এটা password manager-এ রেখে দিন।

ফাইলটা শুধু আপনি পড়তে পারবেন এমন করুন:

```bash
chmod 600 .env
```

---

### ৫. প্রথমবার চালু করা (HTTPS সহ)

```bash
bash init-ssl.sh
```

এই script যা করে:
1. API-র image build করে (প্রথমবার কয়েক মিনিট লাগে)।
2. Database migration চালায়।
3. সব কিছু চালু করে।
4. Let's Encrypt থেকে বিনা খরচের HTTPS সার্টিফিকেট নেয়।

শেষে যাচাই করুন:

```bash
curl https://api.example.com/api/health
```

`"status":"ok"` এলে API চালু হয়ে গেছে।

**Staging-এ demo data চাইলে** (production-এ এটা নিজেই চলতে দেয় না):

```bash
docker compose -f docker-compose.prod.yml run --rm migrate npm run db:seed
```

এরপর demo account (যেমন `rahim.demo@example.com`, পাসওয়ার্ড `274816`) দিয়ে login করা যাবে।

---

### ৬. সার্টিফিকেট নবায়ন আর প্রতিদিনের backup (cron)

```bash
crontab -e
```

এই দুটো লাইন যোগ করুন (`/home/deploy/...` আপনার ঠিকানা অনুযায়ী বদলাবেন):

```cron
# HTTPS সার্টিফিকেট নবায়ন (দিনে দুবার দেখে; মেয়াদ শেষের কাছাকাছি হলে নবায়ন করে)
17 3,15 * * * cd /home/deploy/daily-health/daily-health/deploy && docker compose -f docker-compose.prod.yml run --rm certbot renew --quiet && docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

# প্রতিদিন রাত ২:৩০-এ DB backup (১৪ দিন রাখে)
30 2 * * * /bin/bash /home/deploy/daily-health/daily-health/deploy/backup-db.sh >> /home/deploy/backup.log 2>&1
```

Backup শুধু এই server-এ রাখলে server হারালে backup-ও হারাবে। মাঝে মাঝে `deploy/backups/`-এর ফাইল নিজের কম্পিউটারে বা অন্য কোথাও copy করে রাখুন।

---

### ৭. নতুন code দিলে (update)

```bash
cd ~/daily-health && git pull
cd daily-health/deploy
docker compose -f docker-compose.prod.yml up -d --build
```

নতুন migration থাকলে নিজে থেকেই চলবে, তারপর API নতুন করে চালু হবে।

---

### ৮. দরকারি command

```bash
cd ~/daily-health/daily-health/deploy
C="docker compose -f docker-compose.prod.yml"

$C ps                     # কোনটা চলছে
$C logs -f api            # API-র log (Ctrl+C দিয়ে বের হবেন)
$C restart api            # API আবার চালু
$C exec postgres psql -U daily_health -d daily_health   # DB-তে ঢোকা
```

**Backup থেকে DB ফেরত আনা:**

⚠️ এটা এখনকার data-র ওপর লিখে দেয়।

```bash
$C exec -T postgres pg_restore -U daily_health -d daily_health --clean --if-exists < backups/db-YYYYMMDD-HHMMSS.dump
```

---

### ৯. চালু হওয়ার পর app আর অন্য সেবায় যা বদলাতে হবে

- **Mobile app:** `EXPO_PUBLIC_API_URL=https://api.example.com` দিয়ে নতুন build। এখন https, তাই `http` চালু করার plugin আর লাগবে না।
- **Web panel:** তার `API_BASE_URL=https://api.example.com/api/v1` আর `NEXT_PUBLIC_REALTIME_URL=https://api.example.com`। Panel যেখানে চলবে, তার ঠিকানা API-র `CORS_ORIGINS`-এ দিন।
- **shurjoPay:** merchant panel-এ IPN URL হবে `https://api.example.com/api/v1/payments/ipn/shurjopay` (API প্রতিটা payment-এর সাথে এটা নিজেও পাঠায়)।
- **BulkSMSBD:** dashboard-এ IP whitelist চাইলে VPS-এর IP দিন।

---

### সমস্যা হলে

| লক্ষণ | কী দেখবেন |
|---|---|
| `init-ssl.sh` সার্টিফিকেট পায় না | DNS এখনো VPS-এ আসেনি (`nslookup`), port 80 বন্ধ (`ufw status`), বা Cloudflare proxy চালু |
| API বারবার restart হয় | `$C logs api`। প্রায়ই `.env`-এর কোনো ভুল, log-এ কোন ঘর ভুল তা লেখা থাকে |
| `migrate` ব্যর্থ | `$C logs migrate`। `DATABASE_URL`-এর পাসওয়ার্ড `POSTGRES_PASSWORD`-এর সাথে মিলছে কিনা দেখুন |
| ছবি বা রিপোর্ট আসে না | R2-এর key, bucket-এর নাম, আর `PUBLIC_FILES_BASE_URL` |
| কল বা চ্যাট লাইভ আসে না | Socket.io-র সংযোগ Nginx দিয়ে যাচ্ছে কিনা (`$C logs nginx`) |

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

This project is already instrumented. To connect it, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It writes the app key and secret into `.env` and makes every `nest start` script (`start`, `start:dev`, `start:debug`) load it. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand: create an application and an API key at [observe.nestjs.com](https://observe.nestjs.com), and set the pair as `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment the app runs in.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
