"""
生前是谁 · Flask 后端
八字推算 → 匹配历史人物 → 穿越历史场景
"""
import os, json
from flask import Flask, render_template, request, jsonify
from urllib.parse import quote
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

app = Flask(__name__)

client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com/v1",
)

# ====== 八字计算 ======

TIANGAN   = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"]
DIZHI     = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"]
SHENGXIAO = ["鼠","牛","虎","兔","龙","蛇","马","羊","猴","鸡","狗","猪"]

GAN_WUXING = {"甲":"木","乙":"木","丙":"火","丁":"火","戊":"土","己":"土","庚":"金","辛":"金","壬":"水","癸":"水"}
ZHI_WUXING = {"子":"水","丑":"土","寅":"木","卯":"木","辰":"土","巳":"火","午":"火","未":"土","申":"金","酉":"金","戌":"土","亥":"水"}
GAN_YINYANG = {"甲":"阳","乙":"阴","丙":"阳","丁":"阴","戊":"阳","己":"阴","庚":"阳","辛":"阴","壬":"阳","癸":"阴"}

MONTH_STEM_BASE = {"甲":2,"己":2,"乙":4,"庚":4,"丙":6,"辛":6,"丁":8,"壬":8,"戊":0,"癸":0}
MONTH_ZHI_BY_SOLAR = [1,2,3,4,5,6,7,8,9,10,11,0]
HOUR_STEM_BASE = {"甲":0,"己":0,"乙":2,"庚":2,"丙":4,"辛":4,"丁":6,"壬":6,"戊":8,"癸":8}

def julian_day(y, m, d):
    if m <= 2:
        y -= 1
        m += 12
    A = y // 100
    B = 2 - A + A // 4
    return int(365.25*(y+4716)) + int(30.6001*(m+1)) + d + B - 1524

def calc_bazi(year, month, day, hour):
    y_si = (year-4) % 10
    y_bi = (year-4) % 12
    y_gan, y_zhi = TIANGAN[y_si], DIZHI[y_bi]

    m_bi = MONTH_ZHI_BY_SOLAR[month-1]
    m_order = (m_bi - 2) % 12
    m_si = (MONTH_STEM_BASE[y_gan] + m_order) % 10
    m_gan, m_zhi = TIANGAN[m_si], DIZHI[m_bi]

    jdn = julian_day(year, month, day)
    offset = (jdn - 2415021) % 60
    d_si, d_bi = (0+offset)%10, (10+offset)%12
    d_gan, d_zhi = TIANGAN[d_si], DIZHI[d_bi]

    h_bi = 0 if hour==23 else ((hour+1)//2)%12
    h_si = (HOUR_STEM_BASE[d_gan] + h_bi) % 10
    h_gan, h_zhi = TIANGAN[h_si], DIZHI[h_bi]

    wx = {"金":0,"木":0,"水":0,"火":0,"土":0}
    for c in [y_gan,y_zhi,m_gan,m_zhi,d_gan,d_zhi,h_gan,h_zhi]:
        w = GAN_WUXING.get(c) or ZHI_WUXING.get(c)
        if w: wx[w] += 1

    return {
        "年柱": f"{y_gan}{y_zhi}", "月柱": f"{m_gan}{m_zhi}",
        "日柱": f"{d_gan}{d_zhi}", "时柱": f"{h_gan}{h_zhi}",
        "日主": d_gan, "日主五行": GAN_WUXING[d_gan],
        "日主阴阳": GAN_YINYANG[d_gan],
        "生肖": SHENGXIAO[(year-4)%12],
        "五行": wx,
        "全字": f"{y_gan}{y_zhi} {m_gan}{m_zhi} {d_gan}{d_zhi} {h_gan}{h_zhi}",
    }

def ask_json(prompt, max_tokens=1200):
    r = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role":"user","content":prompt}],
        max_tokens=max_tokens,
    )
    raw = r.choices[0].message.content
    try:
        s, e = raw.find("{"), raw.rfind("}")+1
        return json.loads(raw[s:e])
    except:
        return {}

def ask_text(prompt, max_tokens=600):
    r = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role":"user","content":prompt}],
        max_tokens=max_tokens,
    )
    return r.choices[0].message.content

# ====== 路由 ======

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analyze", methods=["POST"])
def analyze():
    data = request.json
    try:
        bazi = calc_bazi(
            int(data["year"]), int(data["month"]),
            int(data["day"]),  int(data["hour"])
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    wx = bazi["五行"]
    wx_str = " ".join(f"{k}{v}个" for k,v in wx.items())

    profile = ask_json(f"""你是顶级八字命理师，请严谨推算：

八字：{bazi['全字']}
日主：{bazi['日主']}（{bazi['日主阴阳']}{bazi['日主五行']}）
五行：{wx_str} | 生肖：{bazi['生肖']}

推理步骤：
1. 判断日主旺衰（月支是否生扶日主）
2. 找出用神（需要什么五行来平衡）
3. 判断格局（正官/七杀/食神/伤官/印绶/比劫格）
4. 推导核心性格

然后在整个中国历史（先秦→清末）中，找一位命格与此八字格局最吻合的真实历史人物。

输出严格的JSON（不要有任何注释）：
{{
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
}}""", max_tokens=1000)

    if not profile:
        return jsonify({"error": "AI推算失败，请重试"}), 500

    # 生成头像 URL（Pollinations.ai 免费）
    prompt_en = profile.get("avatar_prompt", f"ancient Chinese portrait of {profile.get('人物','')}, ink painting")
    avatar_url = f"https://image.pollinations.ai/prompt/{quote(prompt_en)}?width=512&height=512&nologo=true&seed=888"

    return jsonify({
        "bazi": bazi,
        "profile": profile,
        "avatar_url": avatar_url,
    })


@app.route("/api/scenarios", methods=["POST"])
def scenarios():
    data = request.json
    hero    = data.get("hero", "")
    dynasty = data.get("dynasty", "")
    profile = data.get("profile", {})
    bazi_str = data.get("bazi_str", "")

    result = ask_json(f"""你是历史顾问，为穿越游戏设计真实历史场景。

玩家穿越成了：【{dynasty}·{hero}】
命格：{profile.get('命格','')} | 性格：{profile.get('性格','')}
八字：{bazi_str}

请生成6个该人物真实经历过的历史小时刻（必须有史书依据）。
每个场景是一个具体的小决策，不要宏大叙事，要有生活感和临场感。

输出JSON（不要注释）：
{{
  "scenarios": [
    {{
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
    }}
  ]
}}""", max_tokens=2000)

    if not result or "scenarios" not in result:
        return jsonify({"error": "场景生成失败"}), 500

    return jsonify(result)


@app.route("/api/result", methods=["POST"])
def result():
    data = request.json
    hero     = data.get("hero", "")
    dynasty  = data.get("dynasty", "")
    profile  = data.get("profile", {})
    bazi_str = data.get("bazi_str", "")
    choices  = data.get("choices", [])   # [{"scenario": ..., "player": "A", "history": "B"}, ...]
    score    = data.get("score", 0)      # 命中历史选择的次数

    choices_str = "\n".join(
        f"场景{i+1}：玩家选{c['player']}，历史选{c['history']}，{'✓命中' if c['player']==c['history'] else '✗不同'}"
        for i, c in enumerate(choices)
    )

    verdict = ask_text(f"""你是命理历史评判者，综合评定玩家的穿越表现。

玩家八字：{bazi_str}
穿越人物：{dynasty}·{hero}（{profile.get('命格','')}）
6道历史选择，命中{score}个：
{choices_str}

请写一份150字的最终评定，包含：
1. 命格契合度评价（用"命格相合X成"表达，X=score/6*10）
2. 分析玩家与{hero}性格上的相似与差异
3. 从八字角度解释为何如此
4. 最后一句：给玩家一句跨越时空的寄语

风格：古典又有温度，不要卖弄，要真诚。""", max_tokens=400)

    level = ["萍水相逢", "略有缘分", "颇为契合", "相知甚深", "命格相通", "前世今生"][min(score, 5)]

    return jsonify({
        "score": score,
        "total": len(choices),
        "level": level,
        "verdict": verdict,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5001)
