jest.mock('server-only', () => ({}), { virtual: true });

import {
  DEFAULT_GEMINI_TASTE_MAX_OUTPUT_TOKENS,
  GeminiGameTasteProvider,
  getConfiguredGameTasteProvider,
  getGeminiTasteMaxOutputTokens,
  getGeminiTasteResponseSchema,
  normalizeGeminiModelId,
} from '../provider';
import {
  GAME_AI_EVIDENCE_PREPROCESSING_VERSION,
  GAME_AI_TASTE_TEXT_LIMITS,
  type GameAiEvidenceDocument,
} from '../types';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const evidence: GameAiEvidenceDocument = {
  schemaVersion: 1,
  preprocessingVersion: GAME_AI_EVIDENCE_PREPROCESSING_VERSION,
  category: 'games',
  entries: [],
  franchises: [],
  dataQuality: {
    titleCount: 0,
    ratedRatio: 0,
    favoriteCount: 0,
    sufficiency: 'sparse',
  },
};

describe('GeminiGameTasteProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.GEMINI_TASTE_MODEL;
    delete process.env.GEMINI_TASTE_MAX_OUTPUT_TOKENS;
    delete process.env.GAMING_AI_TASTE_ENABLED;
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
  });

  it('normalizes model names before building the generateContent URL', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    schemaVersion: 1,
                    identity: { label: 'Test', description: 'Test' },
                    pillars: [],
                    negativeSignals: [],
                    summary: 'Test',
                    openQuestions: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );

    await new GeminiGameTasteProvider('test-key').generateProfile({
      evidence,
      model: 'models/gemini-3.6-flash',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
      expect.any(Object),
    );
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as {
      generationConfig: {
        responseMimeType?: string;
        maxOutputTokens?: number;
        responseSchema?: unknown;
      };
    };
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.maxOutputTokens).toBe(DEFAULT_GEMINI_TASTE_MAX_OUTPUT_TOKENS);
    expect(body.generationConfig.responseSchema).toBeDefined();
  });

  it('parses JSON returned in a markdown fence', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: [
                    '```json',
                    JSON.stringify({
                      schemaVersion: 1,
                      identity: { label: 'Test', description: 'Test' },
                      pillars: [
                        {
                          name: 'One',
                          kind: 'content',
                          description: 'First.',
                          evidenceTitles: ['A Game', 'B Game'],
                        },
                        {
                          name: 'Two',
                          kind: 'behavior',
                          description: 'Second.',
                          evidenceTitles: ['C Game', 'D Game'],
                        },
                      ],
                      negativeSignals: [],
                      summary: 'Test',
                      openQuestions: [],
                    }),
                    '```',
                  ].join('\n'),
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await new GeminiGameTasteProvider('test-key').generateProfile({
      evidence,
      model: 'gemini-3.6-flash',
    });

    expect(result).toMatchObject({ schemaVersion: 1, summary: 'Test' });
    // Contract-compliant on the first attempt, so no structural retry.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws a safe error when Gemini returns non-JSON text', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [
          {
            content: {
              parts: [{ text: 'Not JSON' }],
            },
          },
        ],
      }),
    );

    await expect(
      new GeminiGameTasteProvider('test-key').generateProfile({
        evidence,
        model: 'gemini-3.6-flash',
      }),
    ).rejects.toThrow('Gemini taste profile response was not valid JSON');
  });

  it('throws a safe error when Gemini returns a malformed JSON object', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [
          {
            content: {
              parts: [{ text: '{"schemaVersion":1,"summary":"broken"' }],
            },
          },
        ],
      }),
    );

    await expect(
      new GeminiGameTasteProvider('test-key').generateProfile({
        evidence,
        model: 'gemini-3.6-flash',
      }),
    ).rejects.toThrow('Gemini taste profile response was not valid JSON');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once at temperature zero when Gemini returns malformed JSON first', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [{ text: '{"schemaVersion":1,"summary":"broken"' }],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      schemaVersion: 1,
                      identity: { label: 'Test', description: 'Test' },
                      pillars: [],
                      negativeSignals: [],
                      summary: 'Recovered',
                      openQuestions: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      );

    const result = await new GeminiGameTasteProvider('test-key').generateProfile({
      evidence,
      model: 'gemini-3.6-flash',
    });

    expect(result).toMatchObject({ schemaVersion: 1, summary: 'Recovered' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [, retryInit] = (global.fetch as jest.Mock).mock.calls[1] as [string, { body: string }];
    const retryBody = JSON.parse(retryInit.body) as { generationConfig: { temperature: number } };
    expect(retryBody.generationConfig.temperature).toBe(0);
    expect(warn).toHaveBeenCalledWith('[gaming-ai-taste] Gemini returned invalid JSON; retrying once.', {
      finishReason: 'STOP',
      partCount: 1,
      textLength: 37,
      maxOutputTokens: DEFAULT_GEMINI_TASTE_MAX_OUTPUT_TOKENS,
    });
  });

  it('retries once when the first response parses but misses the structural contract', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Valid JSON, but `summary` overruns the shared character bound — the live failure mode.
    const overlong = {
      schemaVersion: 1,
      identity: { label: 'Test Player', description: 'Test description.' },
      pillars: [
        {
          name: 'One',
          kind: 'content',
          description: 'First pillar.',
          evidenceTitles: ['A Game', 'B Game'],
        },
        {
          name: 'Two',
          kind: 'behavior',
          description: 'Second pillar.',
          evidenceTitles: ['C Game', 'D Game'],
        },
      ],
      negativeSignals: [],
      summary: 'x'.repeat(GAME_AI_TASTE_TEXT_LIMITS.summary + 1),
      openQuestions: [],
    };
    const recovered = { ...overlong, summary: 'Within bounds.' };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          candidates: [
            { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(overlong) }] } },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          candidates: [
            { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(recovered) }] } },
          ],
        }),
      ) as unknown as typeof fetch;

    const provider = new GeminiGameTasteProvider('key');
    const result = await provider.generateProfile({ evidence, model: 'gemini-3.6-flash' });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((result as { summary: string }).summary).toBe('Within bounds.');

    const retryBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body as string,
    ) as { generationConfig: { temperature: number } };
    expect(retryBody.generationConfig.temperature).toBe(0);
    warn.mockRestore();
  });

  it('returns the first response when the retry also misses the contract', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Both attempts short of the two-pillar minimum: the service still gets a payload to
    // classify, so the failure is reported as a schema miss rather than a provider error.
    const shortOfContract = {
      schemaVersion: 1,
      identity: { label: 'Test Player', description: 'Test description.' },
      pillars: [],
      negativeSignals: [],
      summary: 'Short.',
      openQuestions: [],
    };

    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(shortOfContract) }] } },
        ],
      }),
    ) as unknown as typeof fetch;

    const provider = new GeminiGameTasteProvider('key');
    const result = await provider.generateProfile({ evidence, model: 'gemini-3.6-flash' });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(shortOfContract);
    warn.mockRestore();
  });

  it('does not retry a first response that already satisfies the contract', async () => {
    const compliant = {
      schemaVersion: 1,
      identity: { label: 'Test Player', description: 'Test description.' },
      pillars: [
        {
          name: 'One',
          kind: 'content',
          description: 'First pillar.',
          evidenceTitles: ['A Game', 'B Game'],
        },
        {
          name: 'Two',
          kind: 'behavior',
          description: 'Second pillar.',
          evidenceTitles: ['C Game', 'D Game'],
        },
      ],
      negativeSignals: [],
      summary: 'All within bounds.',
      openQuestions: [],
    };

    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(compliant) }] } },
        ],
      }),
    ) as unknown as typeof fetch;

    const provider = new GeminiGameTasteProvider('key');
    const result = await provider.generateProfile({ evidence, model: 'gemini-3.6-flash' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(compliant);
  });

  it('sends the bounded response schema to Gemini', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    schemaVersion: 1,
                    identity: { label: 'Test Player', description: 'Test description.' },
                    pillars: [
                      {
                        name: 'One',
                        kind: 'content',
                        description: 'First.',
                        evidenceTitles: ['A Game', 'B Game'],
                      },
                      {
                        name: 'Two',
                        kind: 'behavior',
                        description: 'Second.',
                        evidenceTitles: ['C Game', 'D Game'],
                      },
                    ],
                    negativeSignals: [],
                    summary: 'Fine.',
                    openQuestions: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const provider = new GeminiGameTasteProvider('key');
    await provider.generateProfile({ evidence, model: 'gemini-3.6-flash' });

    const sent = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string) as {
      generationConfig: { responseSchema: Record<string, unknown> };
    };
    expect(sent.generationConfig.responseSchema).toEqual(getGeminiTasteResponseSchema());
  });

  it('includes provider error status and message in failed requests', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(404, {
        error: {
          code: 404,
          status: 'NOT_FOUND',
          message: 'Model not found or not supported for generateContent',
        },
      }),
    );

    await expect(
      new GeminiGameTasteProvider('test-key').generateProfile({
        evidence,
        model: 'gemini-missing',
      }),
    ).rejects.toThrow(
      'Gemini taste profile failed with 404: NOT_FOUND - 404 - Model not found or not supported for generateContent',
    );
  });
});

describe('getConfiguredGameTasteProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GEMINI_TASTE_MODEL;
    delete process.env.GEMINI_TASTE_MAX_OUTPUT_TOKENS;
    delete process.env.GAMING_AI_TASTE_ENABLED;
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
  });

  it('returns a bare model id even if env includes the models prefix', () => {
    process.env.GAMING_AI_TASTE_ENABLED = 'true';
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_TASTE_MODEL = 'models/gemini-3.6-flash';

    expect(getConfiguredGameTasteProvider().model).toBe('gemini-3.6-flash');
  });

  it('defaults to the selected stable Flash model', () => {
    process.env.GAMING_AI_TASTE_ENABLED = 'false';

    expect(getConfiguredGameTasteProvider().model).toBe('gemini-3.6-flash');
  });
});

describe('normalizeGeminiModelId', () => {
  it('removes one leading models prefix', () => {
    expect(normalizeGeminiModelId('models/gemini-3.6-flash')).toBe('gemini-3.6-flash');
  });
});

describe('getGeminiTasteMaxOutputTokens', () => {
  afterEach(() => {
    delete process.env.GEMINI_TASTE_MAX_OUTPUT_TOKENS;
  });

  it('defaults to 6000 tokens', () => {
    expect(getGeminiTasteMaxOutputTokens()).toBe(DEFAULT_GEMINI_TASTE_MAX_OUTPUT_TOKENS);
  });

  it('clamps configured values to a bounded provider range', () => {
    process.env.GEMINI_TASTE_MAX_OUTPUT_TOKENS = '1000';
    expect(getGeminiTasteMaxOutputTokens()).toBe(2_500);

    process.env.GEMINI_TASTE_MAX_OUTPUT_TOKENS = '20000';
    expect(getGeminiTasteMaxOutputTokens()).toBe(12_000);
  });
});
