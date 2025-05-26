let API_KEY = 'sk-or-v1-c72164d582c154722b6...'; // Replace with your API key
let roleFrequencyCache = new Map(); // Role frequency cache
let roleCache = new Map(); // API results cache
let historicalDialogueIdList = []; // Historical dialogue IDs
let historicalTextList = []; // Historical text
let DiaRule = 2; // Dialogue rule: 0=default, 1=last, 2=second-last, 3=random
let appendRoleMethod = 1; // Role append: 0=disable, 1=default, 2=basic
let randomOrInOrder = 2; // 1: random, 2: sequential
let randomOrFixed = 1; // 1: random, 2: fixed first
let fixedRoles = 1; // 0: not fixed, 1: fixed

// Role definitions (from non-AI rule)
let roleValues = {
    heroine: "①|【女性主角】|👸🏻|♀★|♀️|女主角",
    actorprotagonist: "②|【男性主角】|🤷‍♂️|♂️★|♂️| |男主角",
    girl: "③|【女性少年】|👧🏻|♀️㊣|女[孩娃童]|幼女|孙女|少女|丫头|小女孩",
    boy: "④|【男性少年】|👦🏻|♂️㊣|男[孩娃童]|[童子](?![temper|chicken])|小(家伙|朋友|屁孩|乞丐|[孩娃胖虎])|[道药书]童|幼[童儿子]|少年|鼻涕娃|放牛娃",
    seniorfemale: "⑤|【女性老年】|👵🏻|♀️↑|(?<!少)奶奶|祖母|姥姥|...|中年女人|仆妇|巫女",
    seniormale: "⑥|【男性老年】|👴🏻|♂️↑|爷爷|祖父|...|老僧|道士|掌柜",
    youngadultfemale: "⑦|【女性青年】|👩🏻|♀️↓|她|青年女|女青年|女侠|...|护士|服务员",
    youngadultmale: "⑧|【男性青年】|👨🏻|♂️↓|他|青年|年轻人|...|医生|教练",
    olderadultfemale: "⑨|【女性中年】|🤵🏻‍♀️|♀️☆|中年妇女|...|静|欣",
    olderadultmale: "⑩|【男性中年】|🤵🏻‍♂️|♂️☆|中年|...|正|之"
};

// Regex for initial role hints (simplified for clarity)
let narrationFrontRegex = "(?<!(__ALLROLE__)[一-龥&&[^听传的]]{1,20})(__ROLE__)(?!.{0,50}(只听|听到|听见))";
let narrationBackRegex = "(?<!(__ALLROLE__)[一-龥&&[^听传的]]{1,20})(__ROLE__)(?!.{0,5}(只听|听到|听见))";

let SpeechRuleJS = {
    name: "AI朗读规则（增强多角色）",
    id: "ttsrv.multi_voice",
    author: "TTS Server",
    version: 8,
    zdfp: 1, // 1: Auto-assign roles with AI
    tags: {
        narration: { name: "旁白", emotion: "neutral" },
        dialogue: { name: "对话🗣️", emotion: "neutral" },
        heroine: { name: "① 女性主角👸🏻", value: roleValues.heroine, emotion: "positive" },
        actorprotagonist: { name: "② 男性主角🤷‍♂️", value: roleValues.actorprotagonist, emotion: "firm" },
        girl: { name: "③ 女性少年👧🏻", value: roleValues.girl, emotion: "calm" },
        boy: { name: "④ 男性少年👦🏻", value: roleValues.boy, emotion: "lively" },
        seniorfemale: { name: "⑤ 女性老年👵🏻", value: roleValues.seniorfemale, emotion: "gentle" },
        seniormale: { name: "⑥ 男性老年👴🏻", value: roleValues.seniormale, emotion: "calm" },
        youngadultfemale: { name: "⑦ 女性青年👩🏻", value: roleValues.youngadultfemale, emotion: "positive" },
        youngadultmale: { name: "⑧ 男性青年👨🏻", value: roleValues.youngadultmale, emotion: "neutral" },
        olderadultfemale: { name: "⑨ 女性中年🤵🏻‍♀️", value: roleValues.olderadultfemale, emotion: "calm" },
        olderadultmale: { name: "⑩ 男性中年🤵🏻‍♂️", value: roleValues.olderadultmale, emotion: "firm" }
    },

    // Split text into sentences
    splitText(text) {
        if (typeof text !== "string") {
            console.error("splitText: Input is not a string, converting", text);
            text = String(text || "");
        }
        let separatorStr = "。？!；";
        let list = [];
        let tmpStr = "";
        text.split("").forEach((char, index) => {
            tmpStr += char;
            if (separatorStr.includes(char)) {
                list.push(tmpStr);
                tmpStr = "";
            } else if (index === text.length - 1) {
                list.push(tmpStr);
            }
        });
        return list.filter(item => item.replace(/[“”]/g, "").trim().length > 0);
    },

    // Get all role strings for regex
    getAllRoleStr() {
        let allrole = [];
        for (let roleIdx in this.tags) {
            if (roleIdx === "narration" || roleIdx === "dialogue" || !this.tags[roleIdx].value) continue;
            let tmpRoleValue = String(this.tags[roleIdx].value || "").replace(/\n/g, "");
            if (tmpRoleValue) {
                let tmpRoles = tmpRoleValue.split("|");
                tmpRoles.forEach(role => {
                    if (!allrole.includes(role)) allrole.push(role);
                });
            }
        }
        return allrole.join("|");
    },

    // Regex-based role matching (initial hint)
    getMatchRegexFlag(roleValue, allroleStr, regexStr, str) {
        if (typeof roleValue !== "string" || typeof regexStr !== "string" || typeof str !== "string") {
            console.error("getMatchRegexFlag: Invalid input types", { roleValue, regexStr, str });
            return false;
        }
        let tmpRoleValue = roleValue.replace(/\n/g, "");
        if (!tmpRoleValue) return false;
        let tmpRegexStr = regexStr.replace(/__ROLE__/g, tmpRoleValue).replace(/__ALLROLE__/g, allroleStr || "");
        console.log("Regex:", tmpRegexStr);
        try {
            return new RegExp(tmpRegexStr, "u").test(str);
        } catch (e) {
            console.error("Regex error:", e);
            return false;
        }
    },

    // AI-driven role and emotion analysis
    async post(textContent, patientFeedback = {}) {
        if (typeof textContent !== "string") {
            console.error("post: Input is not a string, converting", textContent);
            textContent = String(textContent || "");
        }
        if (roleCache.has(textContent)) {
            return JSON.stringify(roleCache.get(textContent));
        }
        try {
            // Try local TTS first for low latency
            if (typeof ttsrv !== "undefined" && ttsrv.localTTSAvailable && ttsrv.localTTSAvailable()) {
                const result = ttsrv.localTTSProcess(textContent, { model: "ChatTTS", emotion: patientFeedback.emotion || "neutral" });
                roleCache.set(textContent, result);
                return JSON.stringify(result);
            }
            // AI API call for role, emotion, and feedback
            const encryptedText = typeof AES !== "undefined" ? AES.encrypt(textContent, 'secret-key').toString() : textContent;
            const prompt = `Analyze the following text for TTS role assignment and emotion in a rehabilitation context. Return a JSON object with "role" (one of: heroine, actorprotagonist, girl, boy, seniorfemale, seniormale, youngadultfemale, youngadultmale, olderadultfemale, olderadultmale, narration, dialogue), "emotion" (e.g., positive, neutral, firm, calm, gentle, lively), and "feedback" (optional encouraging text if patientFeedback.actionCompleted is true). Text: "${encryptedText}". Patient feedback: ${JSON.stringify(patientFeedback)}.`;
            const requestData = {
                model: "google/gemini-2.0-flash-exp:free",
                messages: [{ role: 'user', content: prompt }]
            };
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            };
            const response = ttsrv.httpPost(
                'https://openrouter.ai/api/v1/chat/completions',
                JSON.stringify(requestData),
                headers
            );
            let result = JSON.parse(response.body().string()).choices[0]?.message?.content || { role: "narration", emotion: "neutral" };
            result = typeof result === "string" ? JSON.parse(result) : result;
            if (patientFeedback.actionCompleted && !result.feedback) {
                result.feedback = "很好，继续保持！";
            }
            roleCache.set(textContent, result);
            return JSON.stringify(result);
        } catch (error) {
            console.error('AI API or local TTS failed:', error);
            return JSON.stringify({ role: "narration", emotion: "neutral", feedback: patientFeedback.actionCompleted ? "很好，继续保持！" : "" });
        }
    },

    // Process text with AI
    async handleText(text, patientFeedback = {}) {
        if (typeof text !== "string") {
            console.error("handleText: Input is not a string, converting", text);
            text = String(text || "");
        }
        console.log("Input text:", text);
        let list = [];
        let sentences = this.splitText(text);
        historicalTextList = historicalTextList.concat(sentences);
        let allroleStr = this.getAllRoleStr();
        let reverseMap = {};
        Object.keys(this.tags).forEach(key => {
            if (key === "narration" || key === "dialogue") return;
            String(this.tags[key].value || "").split("|").forEach(name => reverseMap[name] = key);
        });

        let lastDialogueTag = historicalDialogueIdList.length > 0 ? historicalDialogueIdList[historicalDialogueIdList.length - 1] : null;
        let secondLastDialogueTag = historicalDialogueIdList.length > 1 ? historicalDialogueIdList[historicalDialogueIdList.length - 2] : null;

        for (let tmpStr of sentences) {
            tmpStr = tmpStr.trim();
            if (!tmpStr) continue;
            let endTag = "narration";
            let emotion = "neutral";
            let feedback = "";

            // Initial regex-based role hint
            if (tmpStr[0] === "“") {
                let js = tmpStr.match(/【(.*?)】/) || [];
                if (js.length > 1) {
                    endTag = reverseMap[js[1]] || "dialogue";
                    tmpStr = tmpStr.replace(/【.*?】/, "");
                } else {
                    endTag = "dialogue";
                    if (DiaRule === 1 && lastDialogueTag) endTag = lastDialogueTag;
                    else if (DiaRule === 2 && secondLastDialogueTag) endTag = secondLastDialogueTag;
                    else if (DiaRule === 3) {
                        let roleKeys = Object.keys(this.tags).filter(k => k !== "narration" && k !== "dialogue");
                        endTag = roleKeys[Math.floor(Math.random() * roleKeys.length)];
                    }
                }
            } else {
                for (let roleIdx in this.tags) {
                    if (roleIdx === "narration" || roleIdx === "dialogue") continue;
                    if (this.getMatchRegexFlag(this.tags[roleIdx].value, allroleStr, narrationFrontRegex, tmpStr) ||
                        this.getMatchRegexFlag(this.tags[roleIdx].value, allroleStr, narrationBackRegex, tmpStr)) {
                        endTag = roleIdx;
                        break;
                    }
                }
            }

            // AI-based role and emotion refinement
            let aiResult = await this.post(tmpStr, patientFeedback);
            try {
                aiResult = JSON.parse(aiResult);
                endTag = aiResult.role || endTag;
                emotion = aiResult.emotion || this.tags[endTag]?.emotion || "neutral";
                feedback = aiResult.feedback || "";
            } catch (e) {
                console.error("AI result parse error:", e);
            }

            list.push({ text: tmpStr, tag: endTag, emotion });
            if (feedback) list.push({ text: feedback, tag: "dialogue", emotion: "positive" });
            if (endTag !== "narration") {
                secondLastDialogueTag = lastDialogueTag;
                lastDialogueTag = endTag;
                historicalDialogueIdList.push(endTag);
            }
        }
        console.log("Output list:", list);
        try {
            return JSON.stringify(list);
        } catch (e) {
            console.error("JSON serialization error:", e);
            return JSON.stringify([{ text: "Serialization error", tag: "narration", emotion: "neutral" }]);
        }
    },

    // Update role frequency
    thhs(val, tet) {
        if (typeof val !== "string" || typeof tet !== "string") {
            console.error("thhs: Invalid input types", { val, tet });
            val = String(val || "");
            tet = String(tet || "");
        }
        val = val.replace(/[^:\d\[\u2E80-\u9FFF\]\n]/g, "").replace(/(\d+):([\u2E80-\u9FFF]+)/g, "【$1】:【$2】");
        let a = val.split("\n");
        try {
            for (let x of a) {
                let c = x.split(":") || [];
                if (c.length > 1) {
                    roleFrequencyCache.set(c[1], (roleFrequencyCache.get(c[1]) || 0) + 1);
                    tet = tet.replace(new RegExp(c[0], "g"), c[1]);
                }
            }
            ttsrv.writeTxtFileAsync("jss.json", JSON.stringify(Object.fromEntries(roleFrequencyCache)));
            return tet;
        } catch (e) {
            console.error("thhs error:", e);
            return tet;
        }
    },

    // Debug role frequency (JSON output)
    qjs() {
        let a2 = [];
        for (let [role, freq] of roleFrequencyCache) {
            a2.push({ role, frequency: freq });
        }
        a2.sort((a, b) => b.frequency - a.frequency);
        console.log("Role frequency:", a2);
        try {
            return JSON.stringify(a2);
        } catch (e) {
            console.error("qjs JSON error:", e);
            return JSON.stringify([]);
        }
    }
};

// Export only the rule object
if (typeof module !== "undefined" && module.exports) {
    module.exports = SpeechRuleJS;
} else {
    this.SpeechRuleJS = SpeechRuleJS;
}