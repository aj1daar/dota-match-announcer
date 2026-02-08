import { Context } from 'telegraf';
import { Env } from '../index';

export interface CustomContext extends Context {
    env: Env;
}
