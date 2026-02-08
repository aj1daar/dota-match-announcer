import { CallbackQuery } from 'telegraf/types';

type DataCallbackQuery = CallbackQuery & { data: string };

export function isDataCallbackQuery(query: CallbackQuery): query is DataCallbackQuery {
    return (query as DataCallbackQuery).data !== undefined;
}
