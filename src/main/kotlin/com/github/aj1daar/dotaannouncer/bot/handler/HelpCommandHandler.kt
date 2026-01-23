package com.github.aj1daar.dotaannouncer.bot.handler

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot
import com.github.aj1daar.dotaannouncer.bot.help.HelpRegistry
import org.springframework.stereotype.Component

@Component
class HelpCommandHandler(
    private val bot: DotaTelegramBot
) : CommandHandler {
    override fun canHandle(command: String): Boolean {
        return command.startsWith("/help")
    }

    override fun handle(chatId: Long, command: String) {
        val helpText = HelpRegistry.commands.joinToString(separator = "\n") { cmd ->
            "${cmd.command} - ${cmd.description}"
        }
        bot.sendNotification(chatId, "📖 Available commands:\n$helpText")
    }
}