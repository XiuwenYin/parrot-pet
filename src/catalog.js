// 鸟种 / 习性 / 形象 / 动作 / 大小 的统一清单。主进程和渲染进程共用。
// SPECIES：每个颜色品系一项。shape 决定卡通外形（parrot.js 的 SHAPES），也决定属于哪个家族（FAMILIES）；
//          palette 决定配色。
// FAMILIES：每种鹦鹉的习性——随机动作的偏好、叫声、被拎太久的反应、说的话。
// 加新鹦鹉：在 parrot.js 的 SHAPES 加外形，在这里加 FAMILIES 和 SPECIES。

const SPECIES = {
  roseicollis: {
    name: '桃脸牡丹',
    shape: 'lovebird',
    palette: {
      body: '#7CC55C', bodyDark: '#4E9E3E', belly: '#C3E89A',
      wing: '#62AE48', wingEdge: '#3F8434', flight: '#3D6E8C',
      rump: '#5A9BE6', tail: '#55A04A',
      head: '#7CC55C', face: '#F8A79C', forehead: '#EC5B5B',
      beak: '#F3E7C6', beakDark: '#D9C79B',
      eye: '#1B1B1B', eyeRing: null, feet: '#A99A92',
    },
  },
  roseicollisBlue: {
    name: '蓝桃脸',
    shape: 'lovebird',
    palette: {
      body: '#86B9DD', bodyDark: '#5E95BF', belly: '#F4F3EE',
      wing: '#79AED6', wingEdge: '#5788B0', flight: '#4F6F96',
      rump: '#5C8FD0', tail: '#6FA3CC',
      head: '#9AA2A8', face: '#F3F1EC', forehead: '#E7E2D8',
      beak: '#F5A867', beakDark: '#D9844A',
      eye: '#1B1B1B', eyeRing: null, feet: '#C49A7C',
    },
  },
  lutino: {
    name: '黄桃脸（黄化）',
    shape: 'lovebird',
    palette: {
      body: '#F4DE4B', bodyDark: '#E3C537', belly: '#FAEE8C',
      wing: '#F0D640', wingEdge: '#D9B92A', flight: '#F7EFC4',
      rump: '#FFFDF2', tail: '#EBCF3B',
      head: '#F4DE4B', face: '#F79A93', forehead: '#E8434B',
      beak: '#F3E7C6', beakDark: '#D9C79B',
      eye: '#B0283A', eyeRing: null, feet: '#EBC3BC',
    },
  },
  fischeri: {
    name: '费氏牡丹',
    shape: 'lovebird',
    palette: {
      body: '#5DBA45', bodyDark: '#3E9A34', belly: '#93D467',
      wing: '#47A33A', wingEdge: '#2E7E2A', flight: '#2F6E8C',
      rump: '#6F78D8', tail: '#3E9A3A',
      head: '#E9B34A', face: '#F4873C', forehead: '#E8622E',
      beak: '#E2382C', beakDark: '#B42A22',
      eye: '#1B1B1B', eyeRing: '#FFFFFF', feet: '#A3958D',
    },
  },
  personatus: {
    name: '黄领牡丹',
    shape: 'lovebird',
    palette: {
      body: '#5DBA45', bodyDark: '#3E9A34', belly: '#F2D84A',
      wing: '#47A33A', wingEdge: '#2E7E2A', flight: '#2F6E8C',
      rump: '#4E9A4A', tail: '#3E9A3A',
      head: '#2C2A2A', face: '#2C2A2A', forehead: '#1E1C1C',
      beak: '#E2382C', beakDark: '#B42A22',
      eye: '#1B1B1B', eyeRing: '#FFFFFF', feet: '#A3958D',
      collar: '#F6CF34',
    },
  },
  personatusBlue: {
    name: '蓝牡丹',
    shape: 'lovebird',
    palette: {
      body: '#5FA9D8', bodyDark: '#3F86B8', belly: '#EEF3F6',
      wing: '#4E97C8', wingEdge: '#336F9A', flight: '#2C4F78',
      rump: '#7FB8DE', tail: '#4A8FBE',
      head: '#2C2A2A', face: '#2C2A2A', forehead: '#1E1C1C',
      beak: '#F2C8C0', beakDark: '#D29E95',
      eye: '#1B1B1B', eyeRing: '#FFFFFF', feet: '#A3958D',
      collar: '#F7F9FA',
    },
  },
  // ---------- 虎皮鹦鹉 ----------
  budgieGreen: {
    name: '绿虎皮',
    shape: 'budgie',
    palette: {
      body: '#7CC04A', bodyDark: '#4E9A34', belly: '#A9D96A',
      wing: '#E8DA6A', wingEdge: '#9C8E2E', flight: '#33402c',
      rump: '#6DB84A', tail: '#2F5FA8',
      head: '#E9DC5A', face: '#F3E46A', forehead: '#F7EA7A',
      beak: '#EFD592', beakDark: '#C9A55E',
      eye: '#1B1B1B', eyeRing: '#F4EFE2', feet: '#B6A0B8',
      cere: '#5C82D8', cheekPatch: '#5B4FC0', stripe: '#2a2a1c', scallop: '#262620',
    },
  },
  budgieBlue: {
    name: '蓝虎皮',
    shape: 'budgie',
    palette: {
      body: '#6FA6DE', bodyDark: '#3F78B8', belly: '#9CC6EE',
      wing: '#EEF0F2', wingEdge: '#8C96A4', flight: '#2a3340',
      rump: '#5E98D6', tail: '#25438C',
      head: '#EEF0F2', face: '#F6F7F8', forehead: '#FFFFFF',
      beak: '#EFD592', beakDark: '#C9A55E',
      eye: '#1B1B1B', eyeRing: '#F4EFE2', feet: '#B6A0B8',
      cere: '#5C82D8', cheekPatch: '#4A4FB8', stripe: '#24262c', scallop: '#22242a',
    },
  },
  budgieLutino: {
    name: '黄化虎皮',
    shape: 'budgie',
    palette: {
      body: '#F3E15A', bodyDark: '#D9C23A', belly: '#F8EC8A',
      wing: '#F6EAA0', wingEdge: '#D9C46A', flight: '#F2E6C0',
      rump: '#F1DE5A', tail: '#EFE3B0',
      head: '#F5E465', face: '#F8EC7E', forehead: '#FBF1A0',
      beak: '#EFD592', beakDark: '#C9A55E',
      eye: '#B0283A', eyeRing: '#F4EFE2', feet: '#E8C3BC',
      cere: '#E8B4B8', cheekPatch: '#EDEAF6', stripe: '#E3CF7A', scallop: '#DCC572', throatSpot: '#E2CF92',
    },
  },
  // ---------- 玄凤鹦鹉 ----------
  cockatielGrey: {
    name: '原始灰玄凤',
    shape: 'cockatiel',
    palette: {
      body: '#9A9EA2', bodyDark: '#6E7377', belly: '#B4B7BA',
      wing: '#8C9095', wingEdge: '#5E6266', flight: '#5E6266', wingBar: '#F4F2EC',
      rump: '#8E9296', tail: '#6E7276',
      head: '#A9AAA2', face: '#F2DC5A', forehead: '#F4E070', crest: '#E6D46A', cheekSpot: '#F08A2E',
      beak: '#A4A4A2', beakDark: '#7E7E7C',
      eye: '#1B1B1B', eyeRing: null, feet: '#9E9392', cheek: '#ffb08a',
    },
  },
  cockatielLutino: {
    name: '黄化玄凤',
    shape: 'cockatiel',
    palette: {
      body: '#F6EDCF', bodyDark: '#E4D6A8', belly: '#FBF5E2',
      wing: '#F3E8C4', wingEdge: '#D8C898', flight: '#EFE2B6', wingBar: '#FFFDF5',
      rump: '#F4EACB', tail: '#F0E3BC',
      head: '#F6EDB8', face: '#F7E27A', forehead: '#F8E68A', crest: '#F4DD6A', cheekSpot: '#F2852E',
      beak: '#E8C9B4', beakDark: '#D4AF98',
      eye: '#B0283A', eyeRing: null, feet: '#E8C3BC', cheek: '#ffb08a',
    },
  },
  cockatielWhiteface: {
    name: '白面玄凤',
    shape: 'cockatiel',
    // 雪白的脸和冠羽 + 冷调蓝灰身体 + 深炭灰飞羽和尾巴；白脸边缘收清楚，加一点粉腮红，免得像黑白照片
    palette: {
      body: '#8E98A6', bodyDark: '#626C7A', belly: '#C7CED8',
      wing: '#848E9C', wingEdge: '#525A66', flight: '#3F4650', wingBar: '#FFFFFF',
      rump: '#8A94A2', tail: '#4A515C',
      head: '#E3E7ED', face: '#FCFBF8', forehead: '#FFFFFF', crest: '#D4DAE2', cheekSpot: null,
      beak: '#A9B0BB', beakDark: '#7E8692',
      eye: '#1B1B1B', eyeRing: null, feet: '#D3AFAA', cheek: '#F7A3B6', faceSoft: 'soft1',
    },
  },
  // ---------- 和尚鹦鹉 ----------
  monkGreen: {
    name: '绿和尚',
    shape: 'monk',
    palette: {
      body: '#7DBE5A', bodyDark: '#4F9640', belly: '#C9CFC8',
      wing: '#6CB24C', wingEdge: '#3F7E34', flight: '#3E6FB0',
      rump: '#7DBE5A', tail: '#5FA64A',
      head: '#7DBE5A', face: '#D6DAD4', forehead: '#CDD2CC',
      beak: '#F0C9A0', beakDark: '#D9A77A',
      eye: '#1B1B1B', eyeRing: null, feet: '#A8A09A',
    },
  },
  monkBlue: {
    name: '蓝和尚',
    shape: 'monk',
    palette: {
      body: '#7FB0DA', bodyDark: '#4F82B4', belly: '#D3D7DC',
      wing: '#6FA2D2', wingEdge: '#40699A', flight: '#3D5E9A',
      rump: '#7FB0DA', tail: '#6797C6',
      head: '#7FB0DA', face: '#DCE0E4', forehead: '#D2D6DA',
      beak: '#F0C9A0', beakDark: '#D9A77A',
      eye: '#1B1B1B', eyeRing: null, feet: '#A8A09A',
    },
  },
};

// 习性：weights 覆盖随机动作的权重（0 = 不会自己做），hold = 被拎太久的反应，
// voice = 叫声，lines = 覆盖/补充台词，petted = 被摸时的反应，nightFright = 晚上偶尔夜惊
const FAMILIES = {
  lovebird: {
    name: '牡丹鹦鹉', voice: 'lovebird', hold: 'bite', petted: 'happy',
    weights: { paper: 0.8, hang: 0.6 },
    lines: {
      click: ['啾！', '干嘛～', '陪我玩！', '战斗机出击！', '尖叫一下给你听？', '摸摸头'],
      warn: ['再不放我就咬了！', '放——开——', '我数到三！'],
      bite: ['咔！', '飞行的老虎钳！', '叫你不放！'],
    },
  },
  budgie: {
    name: '虎皮鹦鹉', voice: 'budgie', hold: 'nibble', petted: 'happy',
    weights: { talk: 1.6, mirror: 1.4, sing: 1.5, dance: 1.2, hang: 0.3 },
    lines: {
      click: ['叽！', '你好呀', '小小脑袋大大智慧', '叽叽喳喳', '嘿嘿嘿'],
      talk: ['你好～你好～', '宝宝真棒！', '早上好呀', '吃饭啦吃饭啦', '叽里咕噜…漂亮…', '我是小虎皮'],
      mirror: ['镜子里那只好帅', '你好你好！', '亲一个～', '叮叮叮！'],
      sing: ['叽叽喳喳叽叽喳喳', '咕噜咕噜啾～'],
      warn: ['放开我嘛～', '叽叽叽！'],
    },
  },
  cockatiel: {
    name: '玄凤鹦鹉', voice: 'cockatiel', hold: 'hiss', petted: 'headdown', nightFright: true,
    weights: { whistle: 1.6, peekaboo: 0.9, heartwing: 0.6, headdown: 0.6, sing: 0.2, talk: 0.3, hang: 0.2 },
    lines: {
      click: ['啾～', '嘿～', '憨憨在此', '咕叽？', '在呢在呢'],
      talk: ['嘿～漂亮', 'Peekaboo～', '嘿～你好', '咕叽咕叽'],
      whistle: ['♪ 咕叽咕叽～', '♪ 叽咕叽～咕叽～', '吹一段国歌～'],
      peekaboo: ['Peekaboo！', '躲猫猫！', '找到我啦？'],
      warn: ['嘶——', '嘶嘶！'],
      wake: ['咕…谁？', '吓我一跳'],
    },
  },
  monk: {
    name: '和尚鹦鹉', voice: 'monk', hold: 'bite', petted: 'happy',
    weights: { talk: 1.8, nest: 1.0, quake: 0.7, hang: 0.5 },
    lines: {
      click: ['嘎！', '你好！', '干嘛呢？', '鸟中戏精上线', '哈喽！'],
      wake: ['起床啦！起床啦！', '嘎——早！'],
      talk: ['你好！你好！', '干嘛呢？', '起床啦！', '好吃好吃！', '拜拜～', '我爱你', '嘿！看我！'],
      bite: ['嘎！咬你！', '叫你不放！', '咔！'],
      warn: ['嘎嘎嘎！放开！', '我要咬了哦！'],
    },
  },
};

const MODES = [
  { id: 'cartoon', name: '卡通' },
  { id: 'real', name: '真实（用素材）' },
];

// menu: 是否出现在"做个动作"里；only: 只有这些家族才有的习性动作
const ACTIONS = [
  { id: 'idle', name: '发呆', menu: true },
  { id: 'walk', name: '溜达', menu: true },
  { id: 'fly', name: '飞一圈', menu: true },
  { id: 'eat', name: '吃瓜子', menu: true },
  { id: 'preen', name: '理毛', menu: true },
  { id: 'scratch', name: '挠头', menu: true },
  { id: 'stretch', name: '伸懒腰', menu: true },
  { id: 'sing', name: '唱歌', menu: true },
  { id: 'dance', name: '摇头晃脑', menu: true },
  { id: 'paper', name: '撕纸条插尾巴', menu: true, only: ['lovebird'] },
  { id: 'mirror', name: '照镜子', menu: true, only: ['budgie'] },
  { id: 'talk', name: '说话', menu: true, only: ['budgie', 'cockatiel', 'monk'] },
  { id: 'whistle', name: '吹口哨', menu: true, only: ['cockatiel'] },
  { id: 'heartwing', name: '心形翅膀', menu: true, only: ['cockatiel'] },
  { id: 'headdown', name: '低头讨挠', menu: true, only: ['cockatiel'] },
  { id: 'peekaboo', name: 'Peekaboo 躲猫猫', menu: true, only: ['cockatiel'] },
  { id: 'nest', name: '叼树枝搭窝', menu: true, only: ['monk'] },
  { id: 'quake', name: '和尚抖', menu: true, only: ['monk'] },
  { id: 'hang', name: '倒挂', menu: true },
  { id: 'look', name: '盯着你看', menu: true },
  { id: 'sleep', name: '睡觉', menu: true },
  { id: 'gnaw', name: '啃桌面图标', menu: true },
  { id: 'happy', name: '被摸开心', menu: false },
  { id: 'angry', name: '炸毛', menu: false },
  { id: 'drag', name: '被拎起来', menu: false },
  { id: 'thrown', name: '被扔出去', menu: false },
  { id: 'dizzy', name: '晕了', menu: false },
  { id: 'flutter', name: '扑棱着降落', menu: false },
  { id: 'bite', name: '咬人', menu: false },
  { id: 'nibble', name: '轻轻啄一下', menu: false },
  { id: 'hiss', name: '哈气', menu: false },
  { id: 'fright', name: '夜惊', menu: false },
  { id: 'wake', name: '醒来', menu: false },
];

const SIZES = [
  { id: 'small', name: '小', scale: 0.7 },
  { id: 'medium', name: '中', scale: 1 },
  { id: 'large', name: '大', scale: 1.4 },
];

const familyOf = (speciesId) => (SPECIES[speciesId] || SPECIES.roseicollis).shape;
const actionAllowed = (actionId, family) => {
  const a = ACTIONS.find(x => x.id === actionId);
  return !a || !a.only || a.only.includes(family);
};

if (typeof module !== 'undefined') module.exports = { SPECIES, FAMILIES, MODES, ACTIONS, SIZES, familyOf, actionAllowed };
