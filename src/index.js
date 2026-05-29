// ====== 八字数据 ======
const TIANGAN        = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const DIZHI          = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const SHENGXIAO      = ["鼠","牛","虎","兔","龙","蛇","马","羊","猴","鸡","狗","猪"];
const GAN_WUXING     = {甲:"木",乙:"木",丙:"火",丁:"火",戊:"土",己:"土",庚:"金",辛:"金",壬:"水",癸:"水"};
const ZHI_WUXING     = {子:"水",丑:"土",寅:"木",卯:"木",辰:"土",巳:"火",午:"火",未:"土",申:"金",酉:"金",戌:"土",亥:"水"};
const GAN_YINYANG    = {甲:"阳",乙:"阴",丙:"阳",丁:"阴",戊:"阳",己:"阴",庚:"阳",辛:"阴",壬:"阳",癸:"阴"};
const MONTH_STEM_BASE = {甲:2,己:2,乙:4,庚:4,丙:6,辛:6,丁:8,壬:8,戊:0,癸:0};
const MONTH_ZHI_BY_SOLAR = [1,2,3,4,5,6,7,8,9,10,11,0];
const HOUR_STEM_BASE  = {甲:0,己:0,乙:2,庚:2,丙:4,辛:4,丁:6,壬:6,戊:8,癸:8};

// ====== 八字计算 ======
function julianDay(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524;
}

function calcBazi(year, month, day, hour) {
  const y_si = (year - 4) % 10;
  const y_bi = (year - 4) % 12;
  const y_gan = TIANGAN[y_si], y_zhi = DIZHI[y_bi];

  const m_bi = MONTH_ZHI_BY_SOLAR[month - 1];
  const m_order = ((m_bi - 2) % 12 + 12) % 12;
  const m_si = (MONTH_STEM_BASE[y_gan] + m_order) % 10;
  const m_gan = TIANGAN[m_si], m_zhi = DIZHI[m_bi];

  const jdn = julianDay(year, month, day);
  const offset = ((jdn - 2415021) % 60 + 60) % 60;
  const d_si = (0 + offset) % 10;
  const d_bi = (10 + offset) % 12;
  const d_gan = TIANGAN[d_si], d_zhi = DIZHI[d_bi];

  const h_bi = hour === 23 ? 0 : Math.floor((hour + 1) / 2) % 12;
  const h_si = (HOUR_STEM_BASE[d_gan] + h_bi) % 10;
  const h_gan = TIANGAN[h_si], h_zhi = DIZHI[h_bi];

  const wx = {金:0,木:0,水:0,火:0,土:0};
  for (const c of [y_gan,y_zhi,m_gan,m_zhi,d_gan,d_zhi,h_gan,h_zhi]) {
    const w = GAN_WUXING[c] || ZHI_WUXING[c];
    if (w) wx[w]++;
  }

  return {
    年柱: `${y_gan}${y_zhi}`, 月柱: `${m_gan}${m_zhi}`,
    日柱: `${d_gan}${d_zhi}`, 时柱: `${h_gan}${h_zhi}`,
    日主: d_gan, 日主五行: GAN_WUXING[d_gan],
    日主阴阳: GAN_YINYANG[d_gan],
    生肖: SHENGXIAO[(year - 4) % 12],
    五行: wx,
    全字: `${y_gan}${y_zhi} ${m_gan}${m_zhi} ${d_gan}${d_zhi} ${h_gan}${h_zhi}`,
  };
}

// ====== DeepSeek 调用 ======
async function askJson(prompt, apiKey, maxTokens = 1200) {
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `DeepSeek ${res.status}`);
  const raw = data.choices[0].message.content;
  try {
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}") + 1;
    return JSON.parse(raw.slice(s, e));
  } catch {
    return {};
  }
}

async function askText(prompt, apiKey, maxTokens = 600) {
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `DeepSeek ${res.status}`);
  return data.choices[0].message.content;
}

// ====== 路由处理 ======
async function handleAnalyze(body, apiKey) {
  const { year, month, day, hour } = body;
  const bazi = calcBazi(parseInt(year), parseInt(month), parseInt(day), parseInt(hour) || 12);
  const wx = bazi["五行"];
  const wx_str = Object.entries(wx).map(([k,v]) => `${k}${v}个`).join(" ");

  const profile = await askJson(`你是顶级八字命理师，请严谨推算：

八字：${bazi["全字"]}
日主：${bazi["日主"]}（${bazi["日主阴阳"]}${bazi["日主五行"]}）
五行：${wx_str} | 生肖：${bazi["生肖"]}

推理步骤：
1. 判断日主旺衰（月支是否生扶日主）
2. 找出用神（需要什么五行来平衡）
3. 判断格局（正官/七杀/食神/伤官/印绶/比劫格）
4. 推导核心性格

然后在整个中国历史（先秦→清末）中，找一位命格与此八字格局最吻合的真实历史人物。

输出严格的JSON（不要有任何注释）：
{
  "日主旺衰": "一句话判断",
  "用神": "哪种五行",
  "格局": "什么格局",
  "性格": "3-4个词",
  "命格": "20字总结",
  "人物": "历史人物姓名",
  "朝代": "所在朝代",
  "生卒": "大约生卒年，如约前500-前430年",
  "职业": "身份，如：谋士/将领/皇帝/文人/商人",
  "匹配理由": "从日主、格局、用神三角度说明，80字以内",
  "人物简介": "该人物一生最重要的事，60字以内",
  "avatar_prompt": "用英文描述该历史人物的古风画像，用于AI绘图，30词以内，包含朝代特征服饰"
}`, apiKey, 1000);

  if (!profile || !profile["人物"]) {
    return Response.json({ error: "AI推算失败，请重试" }, { status: 500 });
  }

  const prompt_en = profile["avatar_prompt"] || `ancient Chinese portrait of ${profile["人物"]}, ink painting`;
  const avatar_url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt_en)}?width=512&height=512&nologo=true&seed=888`;

  return Response.json({ bazi, profile, avatar_url });
}

async function handleScenarios(body, apiKey) {
  const { hero, dynasty, profile, bazi_str } = body;

  const result = await askJson(`你是历史顾问，为穿越游戏设计真实历史场景。

玩家穿越成了：【${dynasty}·${hero}】
命格：${profile["命格"] || ""} | 性格：${profile["性格"] || ""}
八字：${bazi_str}

请生成6个该人物真实经历过的历史小时刻（必须有史书依据）。
每个场景是一个具体的小决策，不要宏大叙事，要有生活感和临场感。

输出JSON（不要注释）：
{
  "scenarios": [
    {
      "index": 1,
      "title": "场景标题（10字内）",
      "age": 该人物当时的大约年龄数字,
      "year": "公元某年或某朝某年",
      "context": "历史背景，交代清楚当时局势，50字",
      "moment": "用第一人称现在时描述你此刻的处境，有画面感，60字",
      "question": "你面临的具体选择是什么？（20字内）",
      "choice_a": "选项A（15字内）",
      "choice_b": "选项B（15字内）",
      "choice_c": "选项C（15字内）",
      "history_answer": "A或B或C（历史上他实际选了哪个）",
      "history_result": "历史上真实发生的结果，50字",
      "insight": "这个选择体现了他命格中哪个特质，30字"
    }
  ]
}`, apiKey, 2000);

  if (!result || !result["scenarios"]) {
    return Response.json({ error: "场景生成失败" }, { status: 500 });
  }
  return Response.json(result);
}

async function handleResult(body, apiKey) {
  const { hero, dynasty, profile, bazi_str, choices, score } = body;

  const choices_str = choices.map((c, i) =>
    `场景${i+1}：玩家选${c.player}，历史选${c.history}，${c.player === c.history ? "✓命中" : "✗不同"}`
  ).join("\n");

  const verdict = await askText(`你是命理历史评判者，综合评定玩家的穿越表现。

玩家八字：${bazi_str}
穿越人物：${dynasty}·${hero}（${profile["命格"] || ""}）
6道历史选择，命中${score}个：
${choices_str}

请写一份150字的最终评定，包含：
1. 命格契合度评价（用"命格相合X成"表达，X=score/6*10）
2. 分析玩家与${hero}性格上的相似与差异
3. 从八字角度解释为何如此
4. 最后一句：给玩家一句跨越时空的寄语

风格：古典又有温度，不要卖弄，要真诚。`, apiKey, 400);

  const levels = ["萍水相逢","略有缘分","颇为契合","相知甚深","命格相通","前世今生"];
  const level = levels[Math.min(score, 5)];

  return Response.json({ score, total: choices.length, level, verdict });
}

// ====== 支付相关 ======
async function handlePayCreate(body, env) {
  const { bazi_str, figure, dynasty } = body;
  const orderId = `DST-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  await env.PAYMENTS.put(orderId, JSON.stringify({
    status: "pending",
    bazi_str: bazi_str || "",
    figure: figure || "",
    dynasty: dynasty || "",
    created_at: Date.now(),
  }), { expirationTtl: 86400 });

  // 发邮件通知
  const baseUrl = "https://destiny.oldphoto.site";
  const confirmUrl = `${baseUrl}/api/pay/confirm?id=${orderId}&secret=${env.ADMIN_SECRET}`;
  await sendEmail(env, {
    subject: `【生前是谁】新订单 ${orderId}`,
    html: `
      <h2>有玩家付款了！</h2>
      <p><b>订单号：</b>${orderId}</p>
      <p><b>八字：</b>${bazi_str}</p>
      <p><b>匹配人物：</b>${dynasty}·${figure}</p>
      <br>
      <a href="${confirmUrl}" style="background:#c9a84c;color:#000;padding:12px 28px;text-decoration:none;font-size:16px;border-radius:4px;">
        ✓ 点击确认收款
      </a>
      <p style="color:#999;font-size:12px;margin-top:16px;">点击后玩家页面自动揭晓答案</p>
    `,
  });

  return Response.json({ order_id: orderId });
}

async function handlePayStatus(url, env) {
  const orderId = url.searchParams.get("id");
  if (!orderId) return Response.json({ status: "not_found" });
  const raw = await env.PAYMENTS.get(orderId);
  if (!raw) return Response.json({ status: "not_found" });
  const order = JSON.parse(raw);
  return Response.json({ status: order.status });
}

async function handlePayConfirm(body, env) {
  const { id: orderId, secret } = body;
  if (!orderId || !secret) return Response.json({ error: "参数缺失" }, { status: 400 });
  if (secret !== env.ADMIN_SECRET) return Response.json({ error: "密码错误" }, { status: 403 });
  const raw = await env.PAYMENTS.get(orderId);
  if (!raw) return Response.json({ error: "订单不存在" }, { status: 404 });
  const order = JSON.parse(raw);
  order.status = "paid";
  order.paid_at = Date.now();
  await env.PAYMENTS.put(orderId, JSON.stringify(order));
  return Response.json({ ok: true });
}

async function sendEmail(env, { subject, html }) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer re_6z8mVvJJ_8bYFXophnUMYR1zc8BfqCGtR",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "生前是谁 <onboarding@resend.dev>",
      to: "777sunzichen@gmail.com",
      subject,
      html,
    }),
  });
}

// ====== 入口 ======
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 优先从 API_KEY JSON 读取，否则回退到单独变量
    let cfg = {};
    try {
      const raw = env.API_KEY;
      cfg = (typeof raw === "object" && raw !== null) ? raw : JSON.parse(raw || "{}");
    } catch {}
    const eenv = {
      DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY,
      ADMIN_SECRET:     env.ADMIN_SECRET,
      ADMIN_EMAIL:      env.ADMIN_EMAIL,
      BASE_URL:         env.BASE_URL,
      RESEND_API_KEY:   env.RESEND_API_KEY,
      ...cfg,
      PAYMENTS: env.PAYMENTS,
      ASSETS:   env.ASSETS,
    };
    const apiKey = eenv.DEEPSEEK_API_KEY;

    // 调试端点（临时）
    if (url.pathname === "/api/debug") {
      return Response.json({
        api_key_type: typeof env.API_KEY,
        api_key_set: !!env.API_KEY,
        cfg_keys: Object.keys(cfg),
        deepseek_found: !!eenv.DEEPSEEK_API_KEY,
        resend_found: !!eenv.RESEND_API_KEY,
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    try {
      if (request.method === "GET") {
        if (url.pathname === "/api/pay/status") return await handlePayStatus(url, eenv);
      }

      if (request.method === "POST") {
        const body = await request.json();
        if (url.pathname === "/api/analyze")     return await handleAnalyze(body, apiKey);
        if (url.pathname === "/api/scenarios")   return await handleScenarios(body, apiKey);
        if (url.pathname === "/api/result")      return await handleResult(body, apiKey);
        if (url.pathname === "/api/pay/create")  return await handlePayCreate(body, eenv);
        if (url.pathname === "/api/pay/confirm") return await handlePayConfirm(body, eenv);
      }
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }

    return eenv.ASSETS.fetch(request);
  },
};
