import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

export const Schema = z.object({
  世界运转: z.object({
    当前日期: z.string().prefault('崇祯七年三月初一'),
    十二时辰: z.object({
      时辰: z.enum([
        '子时', '丑时', '寅时', '卯时',
        '辰时', '巳时', '午时', '未时',
        '申时', '酉时', '戌时', '亥时',
      ]).prefault('卯时'),
      刻: z.enum([
        '初刻', '一刻', '二刻', '三刻',
        '四刻', '五刻', '六刻', '七刻',
      ]).prefault('三刻'),
    }).prefault({}),
    二十四时: z.object({
      小时: z.coerce.number().transform(v => _.clamp(v, 0, 23)).prefault(5),
      分钟: z.coerce.number().transform(v => _.clamp(v, 0, 59)).prefault(45),
    }).prefault({}),
    当前地点: z.string().prefault('南直隶安庆府桐城县衙'),
    天气: z.string().prefault('晴'),
    场景: z.enum(['SFW', 'NSFW', 'WAR']).prefault('SFW'),
    世界运转天数: z.coerce.number().prefault(1),
  }).prefault({}),

  主角: z.object({
    官职: z.string().prefault('桐城县衙皂吏'),
    声望: z.coerce.number().transform(v => _.clamp(v, -1000, 1000)).prefault(10),
    声望阶段: z.enum(['遗臭万年', '声名狼藉', '众矢之的', '毁誉参半', '默默无闻', '声名鹊起', '威震一方', '天下景仰', '名垂千古']).prefault('默默无闻'),
    五维: z.object({
      生命: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(60),
      武力: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(15),
      统率: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(10),
      智谋: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(55),
      政治: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(25),
    }).prefault({}),
    私库: z.object({
      金银铜: z.object({
        黄金: z.coerce.number().prefault(0),
        白银: z.coerce.number().prefault(3),
        铜钱: z.coerce.number().prefault(200),
      }).prefault({}),
      重要物品: z.record(
        z.string(),
        z.object({
          简介: z.string().prefault(''),
          数量: z.coerce.number().prefault(1),
        }).prefault({ 简介: '', 数量: 1 })
      ).prefault({}),
    }).prefault({}),
  }).prefault({}),

  人际网络: z.object({
    上司: z.record(
      z.string(),
      z.object({
        身份: z.string().prefault(''),
        好感度: z.coerce.number().transform(v => _.clamp(v, -100, 100)).prefault(0),
        角色心声: z.string().prefault(''),
        是否在场: z.boolean().prefault(true),
      }).prefault({ 身份: '', 好感度: 0, 角色心声: '', 是否在场: true })
    ).prefault({}),

    故友与同僚: z.record(
      z.string(),
      z.object({
        身份: z.string().prefault(''),
        好感度: z.coerce.number().transform(v => _.clamp(v, -100, 100)).prefault(0),
        角色心声: z.string().prefault(''),
        是否在场: z.boolean().prefault(true),
      }).prefault({ 身份: '', 好感度: 0, 角色心声: '', 是否在场: true })
    ).prefault({}),

    下属与幕僚: z.record(
      z.string(),
      z.object({
        身份: z.string().prefault(''),
        好感度: z.coerce.number().transform(v => _.clamp(v, -100, 100)).prefault(0),
        忠心: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
        角色心声: z.string().prefault(''),
        是否在场: z.boolean().prefault(true),
      }).prefault({ 身份: '', 好感度: 0, 忠心: 50, 角色心声: '', 是否在场: true })
    ).prefault({}),

    三教九流: z.record(
      z.string(),
      z.object({
        身份: z.string().prefault(''),
        好感度: z.coerce.number().transform(v => _.clamp(v, -100, 100)).prefault(0),
        角色心声: z.string().prefault(''),
        是否在场: z.boolean().prefault(true),
      }).prefault({ 身份: '', 好感度: 0, 角色心声: '', 是否在场: true })
    ).prefault({}),

    仇敌: z.record(
      z.string(),
      z.object({
        身份: z.string().prefault(''),
        仇恨度: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(0),
        角色心声: z.string().prefault(''),
        是否在场: z.boolean().prefault(true),
      }).prefault({ 身份: '', 仇恨度: 0, 角色心声: '', 是否在场: true })
    ).prefault({}),

    亲属: z.record(
      z.string(),
      z.object({
        身份: z.string().prefault(''),
        好感度: z.coerce.number().transform(v => _.clamp(v, -100, 100)).prefault(0),
        角色心声: z.string().prefault(''),
        是否在场: z.boolean().prefault(true),
      }).prefault({ 身份: '', 好感度: 0, 角色心声: '', 是否在场: true })
    ).prefault({}),

    私帷: z.record(
      z.string(),
      z.object({
        身份: z.string().prefault(''),
        关系: z.enum(['妻', '妾', '通房', '红颜', '女眷']).prefault('红颜'),
        好感度: z.coerce.number().transform(v => _.clamp(v, -100, 100)).prefault(0),
        忠心: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
        角色心声: z.string().prefault(''),
        是否在场: z.boolean().prefault(true),
        生育: z.object({
          周期: z.coerce.number().transform(v => _.clamp(v, 1, 28)).prefault(1),
          时期: z.enum(['经期', '安全期', '危险期']).prefault('安全期'),
          状态: z.enum(['未孕', '已孕', '待产', '产后']).prefault('未孕'),
          末次同房: z.object({
            日期: z.string().prefault(''),
            周期日: z.coerce.number().prefault(0),
            判定概率: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(0),
          }).prefault({}),
          预产期: z.string().prefault(''),
          _预产天数: z.coerce.number().prefault(0),
          _产后天数: z.coerce.number().prefault(0),
        }).prefault({}),
      }).prefault({ 身份: '', 关系: '红颜', 好感度: 0, 忠心: 50, 角色心声: '', 是否在场: true, 生育: {} })
    ).prefault({}),
  }).prefault({}),

  军事: z.object({
    各营: z.record(
      z.string(),
      z.object({
        兵种: z.string().prefault('步兵'),
        人数: z.coerce.number().prefault(0),
        士气: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
        训练: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(30),
        后勤: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
        装备: z.enum(['残破', '简陋', '普通', '精良', '精锐']).prefault('简陋'),
        等级: z.enum(['乌合', '新募', '可用', '良好', '精锐', '名军']).prefault('新募'),
        将领: z.string().prefault(''),
        驻地: z.string().prefault(''),
      }).prefault({ 兵种: '步兵', 人数: 0, 士气: 50, 训练: 30, 后勤: 50, 装备: '简陋', 等级: '新募', 将领: '', 驻地: '' })
    ).prefault({}),

    将领: z.record(
      z.string(),
      z.object({
        统率: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
        武力: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
        智谋: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
        政治: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
        威望: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
      }).prefault({ 统率: 50, 武力: 50, 智谋: 50, 政治: 50, 威望: 50 })
    ).prefault({}),

    战斗记录: z.record(
      z.string(),
      z.object({
        日期: z.string().prefault(''),
        对手: z.string().prefault(''),
        结果: z.string().prefault(''),
        战利品: z.string().prefault(''),
        摘要: z.string().prefault(''),
      }).prefault({ 日期: '', 对手: '', 结果: '', 战利品: '', 摘要: '' })
    ).prefault({}),
  }).prefault({}),

  经济: z.object({
    _自动结算月份: z.string().prefault(''),
    资产: z.record(
      z.string(),
      z.object({
        说明: z.string().prefault(''),
        月入: z.coerce.number().prefault(0),
      }).prefault({ 说明: '', 月入: 0 })
    ).prefault({}),
    流水: z.object({
      本月结余: z.coerce.number().prefault(0),
      月入: z.record(
        z.string(),
        z.object({
          银两: z.coerce.number().prefault(0),
          说明: z.string().prefault(''),
        }).prefault({ 银两: 0, 说明: '' })
      ).prefault({}),
      月出: z.record(
        z.string(),
        z.object({
          银两: z.coerce.number().prefault(0),
          说明: z.string().prefault(''),
        }).prefault({ 银两: 0, 说明: '' })
      ).prefault({}),
    }).prefault({}),
    仓储: z.record(
      z.string(),
      z.object({
        数量: z.coerce.number().prefault(0),
        单位: z.string().prefault('石'),
      }).prefault({ 数量: 0, 单位: '石' })
    ).prefault({}),
    市场: z.object({
      价格指数: z.object({
        粮食: z.coerce.number().transform(v => Math.round(_.clamp(v, 50, 500))).prefault(100),
        军需: z.coerce.number().transform(v => Math.round(_.clamp(v, 50, 500))).prefault(100),
        常用物资: z.coerce.number().transform(v => Math.round(_.clamp(v, 50, 500))).prefault(100),
      }).prefault({}),
      汇率: z.object({
        一两黄金兑白银: z.coerce.number().transform(v => _.clamp(v, 3, 20)).prefault(6),
        一两白银兑铜钱: z.coerce.number().transform(v => Math.round(_.clamp(v, 500, 5000))).prefault(1200),
      }).prefault({}),
      市况: z.string().prefault('平稳'),
      _库存月份: z.string().prefault(''),
      _剩余库存: z.record(
        z.string(),
        z.coerce.number().transform(v => Math.max(0, Math.floor(v)))
      ).prefault({}),
    }).prefault({}),
  }).prefault({}),

  科技: z.record(
    z.string(),
    z.object({
      进度: z.enum(['未开始', '试验中', '小规模试点', '已推广']).prefault('未开始'),
      效果: z.string().prefault(''),
      描述: z.string().prefault(''),
    }).prefault({ 进度: '未开始', 效果: '', 描述: '' })
  ).prefault({}),

  个人史记: z.object({
    大事记: z.record(
      z.string(),
      z.object({
        日期: z.string().prefault(''),
        地点: z.string().prefault(''),
        类型: z.enum([
          '军政',
          '经济',
          '人事',
          '外交',
          '战役',
          '建设',
          '技术',
          '家族',
        ]),
        事迹: z.string().prefault(''),
        影响: z.string().prefault(''),
      })
    ).prefault({}),
  }).prefault({}),

  天下地图: z.object({
    地区态势: z.record(
      z.string(),
      z.object({
        名义归属: z.string().prefault('大明'),
        实控势力: z.string().prefault('未知'),
        实控阵营: z.enum(['主角方', '明廷', '后金', '流寇', '地方中立', '未知']).prefault('未知'),
        争夺状态: z.enum(['稳定', '动荡', '争夺中', '沦陷', '失控']).prefault('稳定'),
        主要势力: z.record(
          z.string(),
          z.object({
            影响力: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(0),
            军事存在: z.string().prefault(''),
            描述: z.string().prefault(''),
          }).prefault({ 影响力: 0, 军事存在: '', 描述: '' })
        ).prefault({}),
        军事态势: z.string().prefault(''),
        经济态势: z.string().prefault(''),
        最近大事: z.string().prefault(''),
      }).prefault({
        名义归属: '大明',
        实控势力: '未知',
        实控阵营: '未知',
        争夺状态: '稳定',
        主要势力: {},
        军事态势: '',
        经济态势: '',
        最近大事: '',
      })
    ).prefault({}),
  }).prefault({}),

  时局与任务: z.object({
    势力关系: z.record(
      z.string(),
      z.object({
        好感度: z.coerce.number().transform(v => _.clamp(v, -100, 100)).prefault(0),
        状态: z.string().prefault('未接触'),
        描述: z.string().prefault(''),
        经济: z.object({
          财政状况: z.enum(['未知', '崩溃', '拮据', '平稳', '富足', '雄厚']).prefault('未知'),
          主要收入: z.string().prefault(''),
          主要支出: z.string().prefault(''),
          粮草: z.object({
            数量: z.coerce.number().prefault(0),
            单位: z.string().prefault('石'),
            状态: z.enum(['未知', '断绝', '紧缺', '尚可', '充足']).prefault('未知'),
          }).prefault({}),
          描述: z.string().prefault(''),
        }).prefault({}),
        军事: z.object({
          总兵力: z.coerce.number().prefault(0),
          主力兵种: z.string().prefault('未知'),
          描述: z.string().prefault(''),
          下属将领: z.record(
            z.string(),
            z.object({
              职位: z.string().prefault(''),
              统率: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
              武力: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
              智谋: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
              忠诚: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
              兵力: z.coerce.number().prefault(0),
              驻地: z.string().prefault(''),
              简介: z.string().prefault(''),
            }).prefault({ 职位: '', 统率: 50, 武力: 50, 智谋: 50, 忠诚: 50, 兵力: 0, 驻地: '', 简介: '' })
          ).prefault({}),
          军队: z.record(
            z.string(),
            z.object({
              兵种: z.string().prefault(''),
              人数: z.coerce.number().prefault(0),
              士气: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
              训练: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
              后勤: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(50),
              装备: z.enum(['残破', '简陋', '普通', '精良', '精锐']).prefault('普通'),
              等级: z.enum(['乌合', '新募', '可用', '良好', '精锐', '名军']).prefault('可用'),
              将领: z.string().prefault(''),
              驻地: z.string().prefault(''),
              状态: z.string().prefault(''),
            }).prefault({ 兵种: '', 人数: 0, 士气: 50, 训练: 50, 后勤: 50, 装备: '普通', 等级: '可用', 将领: '', 驻地: '', 状态: '' })
          ).prefault({}),
        }).prefault({}),
      }).prefault({ 好感度: 0, 状态: '未接触', 描述: '', 经济: {}, 军事: {} })
    ).prefault({}),
    当前任务: z.record(
      z.string(),
      z.object({
        类型: z.string().prefault(''),
        说明: z.string().prefault(''),
        进度: z.string().prefault('未开始'),
      }).prefault({ 类型: '', 说明: '', 进度: '未开始' })
    ).prefault({}),
  }).prefault({}),

  风月阁: z.object({
    同房点数: z.coerce.number().prefault(0),
    器物: z.record(
      z.string(),
      z.object({
        简介: z.string().prefault(''),
        数量: z.coerce.number().prefault(1),
      }).prefault({ 简介: '', 数量: 1 })
    ).prefault({}),
    掌柜絮语: z.string().prefault(''),
  }).prefault({}),
});

$(() => {
  registerMvuSchema(Schema);
});
