import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LobbyControls } from './LobbyControls';
import { fillBots } from '@/api/client';

vi.mock('@/api/client', async () => {
	const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
	return {
		...actual,
		fillBots: vi.fn().mockResolvedValue(undefined),
	};
});

const defaultProps = {
	gameId: 'game-1',
	connection: 'open' as const,
	playerCount: 2,
	minPlayers: 2,
	maxPlayers: 4,
	availableSeats: 2,
	botCount: 0,
	role: 'host' as const,
	onRequestState: vi.fn(),
	readyCount: 1,
	readyTarget: 2,
	waitingForReady: 1,
	hasMinPlayers: false,
	overrideReadyRequirement: false,
	canStart: false,
	startDisabledReason: 'Need more players',
	readyPending: false,
	startPending: false,
	overridePending: false,
	selfReady: false,
	actionsDisabled: false,
	onToggleReady: vi.fn(),
	onStartGame: vi.fn(),
	onToggleOverride: vi.fn(),
};

describe('LobbyControls', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders host bot fill controls when user is host', () => {
		render(<LobbyControls {...defaultProps} />);
		expect(screen.getByText(/Bot seat management/i)).toBeTruthy();
		expect(screen.getByLabelText(/Bots to add/i)).toBeTruthy();
	});

	it('does not render bot fill controls for non-host roles', () => {
		render(<LobbyControls {...defaultProps} role="guest" />);
		expect(screen.queryByText(/Bot seat management/i)).toBeNull();
	});

	it('submits selected bot count when fill button clicked', async () => {
		render(<LobbyControls {...defaultProps} />);
		const input = screen.getByLabelText(/Bots to add/i);
		fireEvent.change(input, { target: { value: '2' } });
		fireEvent.click(screen.getByRole('button', { name: /fill seats with bots/i }));

		await waitFor(() => {
			expect(fillBots).toHaveBeenCalledWith('game-1', 2);
		});
	});

	it('shows ready button for seated players', () => {
		render(<LobbyControls {...defaultProps} role="guest" />);
		expect(screen.getByRole('button', { name: /ready up/i })).toBeInTheDocument();
	});
});
