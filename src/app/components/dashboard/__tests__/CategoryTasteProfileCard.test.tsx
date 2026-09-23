import { toIdentityTraits } from '../CategoryTasteProfileCard';

describe('toIdentityTraits', () => {
  it('uses the full signal denominator instead of normalizing only visible traits', () => {
    const traits = toIdentityTraits(
      [
        { name: 'Adventure', weight: 50 },
        { name: 'RPG', weight: 30 },
        { name: 'Hack', weight: 10 },
      ],
      100,
    );

    expect(traits.map(trait => trait.percentageLabel)).toEqual(['50%', '30%', '10%']);
    expect(traits.map(trait => trait.percentageValue)).toEqual([50, 30, 10]);
  });
});
