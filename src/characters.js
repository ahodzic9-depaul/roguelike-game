const CHARACTERS = [
  {
    id:    'kaido',
    name:  'Kaido',
    title: 'King of Beasts',
    color: COLORS.kaido,
    stats: {
      hp:      200,
      damage:  25,
      speed:   2.5,
      hpBar:   1.0,
      dmgBar:  0.6,
      spdBar:  0.3,
    },
    attack: {
      name: 'Fire Breath',
      desc: 'Short-range fire beam',
    },
    flavor: 'An unstoppable force.\nHigh HP. Measured destruction.',
  },
  {
    id:    'dio',
    name:  'Dio',
    title: 'The Vampire Lord',
    color: COLORS.dio,
    stats: {
      hp:      80,
      damage:  45,
      speed:   3.5,
      hpBar:   0.35,
      dmgBar:  1.0,
      spdBar:  0.6,
    },
    attack: {
      name: 'Knife Barrage',
      desc: 'Arcing knives with gravity',
    },
    flavor: 'It was me, Dio!\nGlass cannon. Devastating output.',
  },
  {
    id:    'levi',
    name:  'Levi',
    title: "Humanity's Strongest",
    color: COLORS.levi,
    stats: {
      hp:      120,
      damage:  15,
      speed:   5.5,
      hpBar:   0.55,
      dmgBar:  0.38,
      spdBar:  1.0,
    },
    attack: {
      name: 'Blade Sweep',
      desc: 'Semi-circle sword arc forward',
    },
    flavor: 'No time to hesitate.\nLightning speed. Precision strikes.',
  },
];
