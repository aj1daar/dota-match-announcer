package com.github.aj1daar.dotaannouncer.bot

import com.github.aj1daar.dotaannouncer.dto.PandaScoreTeamDto
import com.github.aj1daar.dotaannouncer.model.Subscriber
import com.github.aj1daar.dotaannouncer.model.TeamSubscription
import com.github.aj1daar.dotaannouncer.repository.SubscriberRepository
import com.github.aj1daar.dotaannouncer.repository.TeamSubscriptionRepository
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.ParameterizedTypeReference
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.telegram.telegrambots.bots.TelegramLongPollingBot
import org.telegram.telegrambots.meta.api.methods.send.SendMessage
import org.telegram.telegrambots.meta.api.objects.Update
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton
import java.time.LocalDateTime

@Component
class DotaTelegramBot(
    @Value("\${telegram.bot-token}")
    private val token: String,
    @Value("\${telegram.bot-username}")
    private val botName: String,

    private val subscriberRepository: SubscriberRepository,
    private val teamSubscriptionRepository: TeamSubscriptionRepository,
    private val pandaScoreClient: RestClient
) : TelegramLongPollingBot(token) {

    override fun getBotUsername(): String = botName

    override fun onUpdateReceived(update: Update) {
        if (update.hasMessage() && update.message.hasText()) {
            val chatId = update.message.chatId
            val text = update.message.text
            val firstName = update.message.from.firstName

            when {
                text == "/start" -> {
                    saveSubscriber(chatId, firstName)
                    sendNotification(chatId, "👋 Welcome $firstName! Use /search team <name> to follow a team.")
                }
                text.startsWith("/search team ") -> {
                    val query = text.substringAfter("/search team ").trim()
                    if (query.isNotEmpty()) {
                        searchAndSendTeams(chatId, query)
                    } else {
                        sendNotification(chatId, "⚠️ Please type a team name. Example:\n/search team Spirit")
                    }
                }
            }
        }

        if (update.hasCallbackQuery()) {
            val callback = update.callbackQuery
            val data = callback.data
            val chatId = callback.message.chatId

            if (data.startsWith("SUB_TEAM:")) {
                handleTeamSubscription(chatId, data)
            }
        }
    }

    private fun searchAndSendTeams(chatId: Long, query: String) {
        try {
            val teams = pandaScoreClient.get()
                .uri { uriBuilder ->
                    uriBuilder
                        .path("/dota2/teams")
                        .queryParam("search[name]", query)
                        .build()
                }
                .retrieve()
                .body(object : ParameterizedTypeReference<List<PandaScoreTeamDto>>() {})

            if (teams.isNullOrEmpty()) {
                sendNotification(chatId, "❌ No teams found for '$query'.")
                return
            }

            val rows = teams.take(3).map { team ->
                val button = InlineKeyboardButton().apply {
                    text = "Follow: ${team.name}"
                    callbackData = "SUB_TEAM:${team.id}:${team.name}"
                }
                listOf(button)
            }

            val markup = InlineKeyboardMarkup().apply { keyboard = rows }

            val message = SendMessage(chatId.toString(), "🔍 Found teams matching '$query':").apply {
                replyMarkup = markup
            }
            execute(message)

        } catch (e: Exception) {
            println("❌ Error searching teams: ${e.message}")
            sendNotification(chatId, "⚠️ Error searching for teams. Please try again.")
        }
    }

    private fun handleTeamSubscription(chatId: Long, data: String) {
        // Format: SUB_TEAM:1234:TeamName
        val parts = data.split(":")
        val teamId = parts[1].toLong()
        val teamName = parts[2]

        val subscriber = subscriberRepository.findById(chatId).orElse(null)
        if (subscriber != null) {
            if (!teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(chatId, teamId)) {
                val subscription = TeamSubscription(teamId, teamName, subscriber)
                teamSubscriptionRepository.save(subscription)
                sendNotification(chatId, "✅ You are now following **$teamName**!")
            } else {
                sendNotification(chatId, "ℹ️ You are already following $teamName.")
            }
        }
    }

    private fun saveSubscriber(chatId: Long, name: String) {
        if (!subscriberRepository.existsById(chatId)) {
            val sub = Subscriber(chatId, name, LocalDateTime.now())
            subscriberRepository.save(sub)
            println("✅ New subscriber registered: $name ($chatId)")
        }
    }

    fun sendNotification(chatId: Long, text: String) {
        val message = SendMessage(chatId.toString(), text)
        execute(message)
    }
}