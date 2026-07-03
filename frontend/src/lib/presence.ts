const ADJECTIVES = [
  'Swift', 'Quiet', 'Brave', 'Clever', 'Gentle', 'Bold', 'Calm', 'Eager',
  'Jolly', 'Lucky', 'Nimble', 'Proud', 'Sunny', 'Witty', 'Zealous',
]

const ANIMALS = [
  'Otter', 'Falcon', 'Panda', 'Fox', 'Wolf', 'Heron', 'Lynx', 'Raven',
  'Badger', 'Dolphin', 'Ibis', 'Marten', 'Owl', 'Sparrow', 'Tiger',
]

const COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399',
  '#22d3ee', '#60a5fa', '#818cf8', '#a78bfa', '#e879f9', '#fb7185',
]

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

export function randomDisplayName(): string {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`
}

export function randomColor(): string {
  return pick(COLORS)
}
