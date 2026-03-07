import { searchTeamCommand } from '../../../src/bot/commands/searchTeam';
import { PandaScoreClient, Team } from '../../../src/pandascore';
import { Env } from '../../../src';
import { CustomContext } from '../../../src/bot/context';
import { Message } from 'telegraf/types';

jest.mock('../../../src/pandascore');

describe('searchTeamCommand', () => {
    let mockCtx: Partial<CustomContext>;
    let mockEnv: Env;
    let mockPandaScoreClient: jest.Mocked<PandaScoreClient>;

    beforeEach(() => {
        mockEnv = {} as Env;
        mockCtx = {
            from: { id: 12345, is_bot: false, first_name: 'Test' },
            reply: jest.fn(),
            message: { text: '/searchteam OG' } as Message.TextMessage,
            env: mockEnv,
        } as Partial<CustomContext>;

        mockPandaScoreClient = new (PandaScoreClient as jest.Mock<PandaScoreClient>)() as jest.Mocked<PandaScoreClient>;
        (PandaScoreClient as jest.Mock).mockImplementation(
            () => mockPandaScoreClient,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should prompt for a team name if none is provided', async () => {
        (mockCtx.message as Message.TextMessage).text = '/searchteam';
        await searchTeamCommand(mockCtx as CustomContext);

        const [message, options] = (mockCtx.reply as jest.Mock).mock.calls[0];
        expect(message).toContain('Team Search');
        expect(message).toContain('Please enter the team name');
        expect(options).toEqual(expect.objectContaining({ parse_mode: 'Markdown' }));
    });

    it('should return a list of teams found', async () => {
        const mockTeams: Team[] = [
            { id: 1, name: 'OG', acronym: 'OG', image_url: null },
        ];
        mockPandaScoreClient.searchTeams.mockResolvedValue(mockTeams);

        await searchTeamCommand(mockCtx as CustomContext);

        expect(mockPandaScoreClient.searchTeams).toHaveBeenCalledWith('OG');

        const [message, options] = (mockCtx.reply as jest.Mock).mock.calls[0];
        expect(message).toContain('Found 1 team(s) matching "OG"');
        expect(message).toContain('Select a team to subscribe to:');
        expect(options).toEqual({
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'OG', callback_data: 'subscribe_team:1:OG' }],
                ],
            },
        });
    });

    it('should reply when no teams are found', async () => {
        mockPandaScoreClient.searchTeams.mockResolvedValue([]);

        await searchTeamCommand(mockCtx as CustomContext);

        const [message] = (mockCtx.reply as jest.Mock).mock.calls[0];
        expect(message).toContain('No teams found for "OG"');
        expect(message).toContain('Try searching with a different name');
    });
});
