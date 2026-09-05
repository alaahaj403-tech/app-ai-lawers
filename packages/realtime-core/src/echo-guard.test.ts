import { describe, expect, it } from 'vitest';
import { EchoGuard } from './echo-guard.js';

describe('EchoGuard', () => {
  it('suppresses a transcript that matches recently spoken output', () => {
    const g = new EchoGuard();
    g.emitted('I will send the invoice tomorrow morning.', 1000);
    expect(g.isEcho('i will send the invoice tomorrow morning', 2500)).toBe(true);
    expect(g.isEcho('What time does the meeting start?', 2600)).toBe(false);
  });
  it('tolerates minor ASR errors', () => {
    const g = new EchoGuard();
    g.emitted('אני אשלח את החשבונית מחר בבוקר', 0);
    expect(g.isEcho('אני אשלח את החשבונית מחר בבוקר.', 100)).toBe(true);
  });
  it('forgets after the window elapses', () => {
    const g = new EchoGuard({ windowMs: 1000, threshold: 0.8 });
    g.emitted('hello there my friend', 0);
    expect(g.isEcho('hello there my friend', 900)).toBe(true);
    expect(g.isEcho('hello there my friend', 2000)).toBe(false);
  });
  it('does not suppress genuinely new speech that shares a few words', () => {
    const g = new EchoGuard();
    g.emitted('The price is 1250 shekels including tax.', 0);
    expect(g.isEcho('Is the price negotiable?', 10)).toBe(false);
  });
});
