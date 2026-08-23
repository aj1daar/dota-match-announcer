import { escapeHtml } from '../../src/utils/html';

describe('escapeHtml', () => {
    it('escapes &, <, and > so Telegram HTML parse mode does not break', () => {
        expect(escapeHtml('Ninjas in Pyjamas')).toEqual('Ninjas in Pyjamas');
        expect(escapeHtml('<script>alert(1)</script>')).toEqual('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(escapeHtml('Team A & Team B')).toEqual('Team A &amp; Team B');
        expect(escapeHtml('5 < 10 > 3')).toEqual('5 &lt; 10 &gt; 3');
    });
});
