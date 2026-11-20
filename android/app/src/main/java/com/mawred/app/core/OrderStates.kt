package com.mawred.app.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable data class OrderState(val id: String, val label: String, val tone: String = "info", val terminal: Boolean = false, val settled: Boolean = false)
@Serializable private data class StatesFile(val states: List<OrderState>)

/** حالات الطلب من spec/order-states.json (نفس مصدر الخادم والويب). */
class OrderStates(json: String) {
    val all: List<OrderState> = Json { ignoreUnknownKeys = true }.decodeFromString<StatesFile>(json).states
    private val byId = all.associateBy { it.id }
    fun label(id: String) = byId[id]?.label ?: id
    fun tone(id: String) = byId[id]?.tone ?: "info"

    companion object {
        val STAGES = listOf(
            listOf("new"), listOf("under_review", "awaiting_shop_approval"), listOf("confirmed"), listOf("preparing", "ready_for_pickup"),
            listOf("out_for_delivery", "on_the_way"), listOf("delivered"), listOf("financially_completed"),
        )
        fun stageIndex(status: String) = STAGES.indexOfFirst { status in it }
    }
}
