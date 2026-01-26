package com.github.aj1daar.dotaannouncer.bot.handler

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot
import com.github.aj1daar.dotaannouncer.bot.service.MessageCleanupService
import com.github.aj1daar.dotaannouncer.dto.PandaScoreTeamDto
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.springframework.web.util.UriComponentsBuilder
import org.telegram.telegrambots.meta.api.methods.send.SendMessage
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton

@Component
class SearchTeamCommandHandler(
    private val pandaScoreClient: RestClient,
    private val bot: ObjectProvider<DotaTelegramBot>,
    private val messageCleanupService: MessageCleanupService,
    @Value("\${pandascore.token}")
    private val pandaScoreToken: String
) : CommandHandler {

    private val logger = LoggerFactory.getLogger(SearchTeamCommandHandler::class.java)

    override fun canHandle(command: String): Boolean {
        return command.startsWith("/search_team")
    }

    override fun handle(chatId: Long, command: String) {
        val teamName = command.removePrefix("/search_team").trim()
        if (teamName.isEmpty()) {
            bot.getObject().sendNotification(chatId, "⚠️ Please provide a team name.\n\nExample: /search_team Spirit")
            return
        }

        val uri = UriComponentsBuilder
            .fromUriString("https://api.pandascore.co/dota2/teams")
            .queryParam("search[name]", teamName)
            .queryParam("token", pandaScoreToken)
            .build()
            .toUri()

        logger.info("🔍 Searching teams with URI: $uri")

        val teams = try {
            pandaScoreClient.get()
                .uri(uri)
                .retrieve()
                .body(Array<PandaScoreTeamDto>::class.java) ?: emptyArray()
        } catch (e: Exception) {
            logger.error("❌ Error searching for teams: ${e.message}", e)
            bot.getObject().sendNotification(chatId, "⚠️ Error searching for teams. Please try again.")
            return
        }

        if (teams.isEmpty()) {
            bot.getObject().sendNotification(chatId, "❌ No teams found for '$teamName'.")
            return
        }

        val rows = teams.take(5).map { team ->
            val button = InlineKeyboardButton().apply {
                text = "Follow: ${team.name()}"
                callbackData = "SUB_TEAM:${team.id()}:${team.name()}"
            }
            listOf(button)
        }

        val markup = InlineKeyboardMarkup().apply { keyboard = rows }

        val message = SendMessage(chatId.toString(), "🔍 Found teams matching '$teamName':").apply {
            replyMarkup = markup
        }

        val executedMessage = bot.getObject().execute(message)
        messageCleanupService.storeMessageId(chatId, executedMessage.messageId)
    }
}

