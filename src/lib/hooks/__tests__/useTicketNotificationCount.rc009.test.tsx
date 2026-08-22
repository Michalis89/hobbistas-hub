import { act, renderHook } from '@testing-library/react';
import { useTicketNotificationCount } from '../useTicketNotificationCount';

const mockUseTicketNotifications = jest.fn();

jest.mock('@/context/TicketNotificationContext', () => ({
  useTicketNotifications: (...args: unknown[]) => mockUseTicketNotifications(...args),
}));

describe('useTicketNotificationCount RC-009', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the shared singleton ticket notification state', async () => {
    const refresh = jest.fn();
    const value = {
      count: 5,
      userCount: 2,
      adminCount: 3,
      totalCount: 5,
      refresh,
    };
    mockUseTicketNotifications.mockReturnValue(value);

    const { result } = renderHook(() => useTicketNotificationCount());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toBe(value);
    expect(mockUseTicketNotifications).toHaveBeenCalledTimes(1);
  });
});
