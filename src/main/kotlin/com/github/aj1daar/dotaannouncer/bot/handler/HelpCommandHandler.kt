package com.github.aj1daar.dotaannouncer.bot.handler

import com.github.aj1daar.dotaannouncer.bot.help.HelpRegistry
import com.github.aj1daar.dotaannouncer.bot.service.NotificationService
import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Component

@Component
class HelpCommandHandler(
    private val notificationService: ObjectProvider<NotificationService>
) : CommandHandler {
    override fun canHandle(command: String): Boolean {
        return command.startsWith("/help")
    }

    override fun handle(chatId: Long, command: String) {
        val helpText = HelpRegistry.commands.joinToString(separator = "\n") { cmd ->
            "${cmd.command} - ${cmd.description}"
        }
        notificationService.getObject().sendNotification(chatId, "📖 Available commands:\n$helpText")
    }
}