import { motion } from 'framer-motion'
import { TypewriterLine } from '../common/TypewriterLine'

/* ============================================================
 *  新手教程弹窗 —— 详述核心使用逻辑
 *
 *  v3.0：全局去除「判词」旧称，统一为「灵魂底色 / 性格素描」。
 * ============================================================ */

interface TutorialDialogProps {
  onClose: () => void
}

const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: '一、先认识你的性格',
    body:
      '苏格拉底会给你两个选择：' +
      '如果你已经知道自己的 MBTI，直接从 16 型里选一个即可；' +
      '如果还不太确定，就让苏格拉底用 20 个问题把它问出来。' +
      '每一题的切入点都会根据你刚才的回答调整 —— ' +
      '所以请凭第一直觉作答，不要修饰。',
  },
  {
    title: '二、你的星盘从何处而来',
    body:
      '我们会用你的出生日期、城市，以及（若你知道）出生时刻，' +
      '推算太阳、月亮、上升的位置与十二宫分布。' +
      '出生地只需要精确到城市，这已经足够让上升宫位落在正确的位置。' +
      '时刻是选填项：不知道也不影响整体判断，只是上升宫位会由当日正午推算。',
  },
  {
    title: '三、什么是「灵魂底色」',
    body:
      '「灵魂底色」（也叫性格素描）不是预言，也不是判决。' +
      '它是一段凝练的描述：把你的性格类型、太阳月亮星座与出生地，' +
      '压成几个关键词与一句话。' +
      '读完之后请对照自己的真实经历 —— 如果对不上，那它就只是参考，不是判决。',
  },
  {
    title: '四、怎样看这个星盘',
    body:
      '进入主页后，中央就是你的本命星盘：外圈是黄道十二宫与刻度，' +
      '行星落在各自的宫位与星座上。' +
      '右上角的「何为星盘？」随时能调出来，里面用大白话讲清楚了' +
      '太阳、月亮、上升三巨头在日常生活里分别代表什么。',
  },
  {
    title: '五、主页怎么用',
    body:
      '主页是满屏卡片式布局，不需要往下滑动：' +
      '星盘旁边是「MBTI」与「天赋解析」两个入口，' +
      '「运势」卡片里收纳了年度、月度与今日运势。' +
      '点击任意一张卡片，它会在当前屏幕上方展开详细内容。' +
      '「天赋解析」里还可以补充你此刻的现状，由 AI 重新推演。',
  },
  {
    title: '六、你的数据存在哪里',
    body:
      '出生信息、答题结果、专属星盘、当日运势与对话历史，' +
      '都保存在你这台设备的浏览器里。' +
      '刷新、关掉浏览器再回来，你都还是同一个旅人。' +
      '在流程中的任何一步点击「返回」，都只会退回上一级，已填的数据不会丢。' +
      '「重新开始」会弹窗确认，然后清空当前档案并回到纯白的初始态。',
  },
]

export function TutorialDialog({ onClose }: TutorialDialogProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-6 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className="thin-scroll max-h-[84vh] w-[min(760px,92vw)] overflow-y-auto bg-paper px-8 py-9 sm:px-12"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[clamp(0.875rem,1vw,1.125rem)] font-semibold tracking-[0.42em] text-ink-mute">
          TUTORIAL
        </p>
        <h2 className="serif-title t-page mt-3 text-ink">新手教程</h2>
        <span className="mt-5 block h-px w-full bg-ink/12" />

        <div className="mt-7 flex flex-col gap-7">
          {SECTIONS.map((s, i) => (
            <section key={s.title} className="flex flex-col gap-2">
              <h3 className="text-[clamp(1.125rem,1.35vw,1.65rem)] font-bold tracking-[0.06em] text-ink">
                {s.title}
              </h3>
              <p className="serif-body t-body font-medium text-ink-soft">
                {i === 0 ? (
                  <TypewriterLine text={s.body} speed={26} />
                ) : (
                  s.body
                )}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-9 flex justify-end">
          <button
            onClick={onClose}
            className="border-0 bg-ink px-7 py-3 text-[clamp(0.9375rem,1.05vw,1.25rem)] font-semibold tracking-[0.22em] text-paper transition-opacity duration-500 hover:opacity-85 focus:outline-none"
          >
            我明白了 →
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
