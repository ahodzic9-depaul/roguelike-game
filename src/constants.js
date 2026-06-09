const W = 1280;
const H = 720;

const STATE = {
  CHAR_SELECT:   'char_select',
  POWER_SELECT:  'power_select',
  DEV_POWERS:    'dev_powers',
  PLAYING:       'playing',
  UPGRADE:       'upgrade',
  STAT_BOOST:    'stat_boost',
  WIN:           'win',
  GAME_OVER:     'game_over',
};

const COLORS = {
  bg:     '#07071a',
  text:   '#e2e8f0',
  dim:    '#64748b',
  gold:   '#f59e0b',
  hpBar:  '#22c55e',
  dmgBar: '#ef4444',
  spdBar: '#38bdf8',

  kaido: { main: '#60a5fa', dark: '#1e3a8a', mid: '#2563eb', glow: 'rgba(96,165,250,'  },
  dio:   { main: '#eab308', dark: '#713f12', mid: '#ca8a04', glow: 'rgba(234,179,8,'   },
  levi:  { main: '#4ade80', dark: '#14532d', mid: '#16a34a', glow: 'rgba(74,222,128,'  },
};
