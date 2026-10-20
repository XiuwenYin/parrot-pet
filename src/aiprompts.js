// AI 生成动作用的提示词：每个动作一句，按鸟种习性补充；统一要求镜头和背景固定，方便后面抠图。
// 主进程（生成队列）和设置窗口共用。

const AI_COMMON = '画面里只有这一只鹦鹉，站在浅灰色纯色背景前。镜头完全固定，不推不拉不移动，背景始终是同样的纯色。' +
  '鹦鹉整只始终完整地在画面中间，动作自然、真实、连贯，羽毛细节清晰。';

const AI_NEGATIVE = '镜头移动，镜头缩放，画面抖动，背景变化，场景切换，人，人手，手指，其他动物，第二只鸟，' +
  '文字，字幕，水印，鸟飞出画面，身体变形，多余的腿，多余的翅膀，多余的头，模糊';

// 通用动作（所有鸟都会）
const AI_ACTIONS = {
  idle: '鹦鹉安静地站着休息，偶尔眨眨眼，轻轻歪一下头，胸口的羽毛随着呼吸微微起伏。',
  preen: '鹦鹉低下头，用嘴仔细梳理胸前和翅膀上的羽毛，梳完抖一抖身子。',
  scratch: '鹦鹉单脚站立，抬起另一只脚伸到头侧挠了挠脸颊，眯着眼很舒服，然后把脚放下。',
  stretch: '鹦鹉先把一侧翅膀连同同侧的腿往后下方伸展开，再收回来，然后把两只翅膀一起向上举起伸了个懒腰。',
  sing: '鹦鹉抬起头张嘴鸣叫，喉咙一鼓一鼓，身体跟着轻轻晃动。',
  dance: '鹦鹉跟着节奏有规律地上下点头，身体左右摇摆，像在跳舞。',
  eat: '鹦鹉低头啄起地上的一颗瓜子，抬起头用嘴灵活地嗑开瓜子，瓜子壳掉落。',
  sleep: '鹦鹉慢慢眯起眼睛，蓬松起羽毛，把头转向背后埋进背上的羽毛里，单脚站着睡着了。',
  look: '鹦鹉好奇地盯着镜头看，歪了歪头，又往另一边歪头。',
  happy: '鹦鹉眯起眼睛，全身羽毛蓬松起来，显得非常舒服满足，轻轻摇了摇身子。',
  walk: '鹦鹉在原地左右小步走动，转了半圈又转回来，始终保持在画面中间。',
  angry: '鹦鹉突然炸起全身羽毛，张开嘴向前示威，身体压低。',
  tall: '鹦鹉好奇地把两条腿伸直站高，露出平时藏在羽毛里的长腿，左右张望一下，再慢慢蹲回去。',
};

// 各家族的习性动作
const AI_FAMILY_ACTIONS = {
  lovebird: {
    paper: '鹦鹉低头从地上撕下一条细细的纸条，叼着纸条把头转向背后，把纸条插进尾巴附近的羽毛里。',
  },
  budgie: {
    talk: '虎皮鹦鹉对着镜头张嘴叽叽喳喳地说个不停，头一点一点的，喉咙不停地动。',
    mirror: '虎皮鹦鹉对着前方快速点头，用嘴轻轻碰了碰前面，又后退一点继续点头叽叽喳喳。',
  },
  cockatiel: {
    whistle: '玄凤鹦鹉竖起头顶的冠羽，抬起头吹口哨，身体随着节奏轻轻摇摆。',
    heartwing: '玄凤鹦鹉挺起胸，把两只翅膀向外张开再向前弯成心形，冠羽竖得高高的。',
    headdown: '玄凤鹦鹉低下头把头顶凑向前方，冠羽微微压平，眯着眼像在等人挠头。',
  },
  monk: {
    talk: '和尚鹦鹉对着镜头张大嘴说话，头左右歪动，表情很丰富。',
    quake: '和尚鹦鹉压低身体，半张开翅膀，全身快速地抖动。',
  },
};

// 每种鸟的名字，写进提示词里让生成更贴近（比"鹦鹉"更具体）
const AI_BIRD_NAME = { lovebird: '牡丹鹦鹉', budgie: '虎皮鹦鹉', cockatiel: '玄凤鹦鹉', monk: '和尚鹦鹉' };

// 只生成核心几段时用这些
const AI_CORE = ['idle', 'preen', 'eat', 'sleep'];

function aiActionList(family) {
  return [...Object.keys(AI_ACTIONS), ...Object.keys(AI_FAMILY_ACTIONS[family] || {})];
}

function aiPrompt(family, action) {
  const text = (AI_FAMILY_ACTIONS[family] || {})[action] || AI_ACTIONS[action] || AI_ACTIONS.idle;
  const name = AI_BIRD_NAME[family] || '鹦鹉';
  return `${text.replace(/^(鹦鹉|虎皮鹦鹉|玄凤鹦鹉|和尚鹦鹉)/, name)}${AI_COMMON.replace('鹦鹉', name)}`;
}

if (typeof module !== 'undefined') module.exports = { AI_NEGATIVE, AI_CORE, aiActionList, aiPrompt };
