package com.github.aj1daar.dotaannouncer.bot.service

import org.springframework.stereotype.Service
import org.telegram.telegrambots.meta.api.objects.replykeyboard.ReplyKeyboardMarkup
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.KeyboardButton
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.KeyboardRow

@Service
class KeyboardService {
    fun createMainMenuKeyboard(): ReplyKeyboardMarkup {
        val keyboard = ReplyKeyboardMarkup()
        keyboard.resizeKeyboard = true
        keyboard.oneTimeKeyboard = false
        keyboard.selective = false

        // Row 1: Help and My Teams
        val row1 = KeyboardRow()
        row1.add(KeyboardButton("📖 Help"))
        row1.add(KeyboardButton("📋 My Teams"))

        // Row 2: Search Team
        val row2 = KeyboardRow()
        row2.add(KeyboardButton("🔍 Search Team"))

        keyboard.keyboard = listOf(row1, row2)
        return keyboard
    }

    /**
     * Creates a keyboard with a "Back to Main Menu" button
     */
    fun createBackToMainMenuKeyboard(): ReplyKeyboardMarkup {
        val keyboard = ReplyKeyboardMarkup()
        keyboard.resizeKeyboard = true
        keyboard.oneTimeKeyboard = false
        keyboard.selective = false

        val row = KeyboardRow()
        row.add(KeyboardButton("🏠 Main Menu"))

        keyboard.keyboard = listOf(row)
        return keyboard
    }

    /**
     * Normalizes button text to command format
     * E.g., "📖 Help" -> "/help", "🔍 Search Team" -> "/search_team"
     */
    fun normalizeButtonText(text: String): String {
        return when {
            text.contains("Help") -> "/help"
            text.contains("My Teams") -> "/my_teams"
            text.contains("Search Team") -> "/search_team"
            text.contains("Main Menu") -> "/start"
            else -> text
        }
    }
}
