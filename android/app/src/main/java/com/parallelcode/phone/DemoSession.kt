package com.parallelcode.phone

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Local samples only. No client, context, credentials, persistence or background work. */
internal class DemoSession {
    private var nextId = 0
    private val _agents = MutableStateFlow(listOf(
        agent("demo-review", "Review the welcome screen", "needs_input", "Waiting for your approval"),
        agent("demo-tests", "Add search tests", "idle", "All 12 sample tests passed"),
    ))
    val agents = _agents.asStateFlow()
    private val _chats = MutableStateFlow(mapOf(
        "demo-review" to chat("The sample welcome screen is ready. May I run its tests?").copy(
            requests = listOf(ChatRequest(
                id = "demo-approval", kind = "approval", text = "Run the sample test suite?",
                action = "Run tests", details = "Demo only: no commands will run.",
                questions = emptyList(), defaultToNo = false, canAlwaysAllow = false, alwaysAllowNote = null,
            )),
        ),
        "demo-tests" to chat("Added search coverage. All 12 sample tests passed. Send a reply to try the chat."),
    ))
    val chats = _chats.asStateFlow()

    fun createTask(prompt: String): String {
        val text = prompt.trim()
        require(text.isNotEmpty()) { "Describe the sample task first." }
        val id = "demo-created-${++nextId}"
        _agents.value += agent(id, text.take(80), "idle", "Sample task created")
        _chats.value += id to chat("Sample task created locally. Send a message to try a reply.").copy(
            items = listOf(item("user", text), item("assistant", "Sample task created locally. Send a message to try a reply.")),
        )
        return id
    }

    fun send(agentId: String, text: String) {
        val current = _chats.value[agentId] ?: error("Unknown sample task")
        require(text.isNotBlank()) { "Write a message first." }
        _chats.value += agentId to current.copy(items = current.items + listOf(
            item("user", text.trim()),
            item("assistant", "Demo reply received. In a paired session, your desktop agent would respond here."),
        ))
        updateAgent(agentId, current.requests.isNotEmpty(), "Demo reply received")
    }

    fun respond(agentId: String, request: ChatRequest, decision: String) {
        val current = _chats.value[agentId] ?: error("Unknown sample task")
        require(current.requests.any { it.id == request.id }) { "This sample request is already answered." }
        require(decision == "accept" || decision == "decline")
        val remaining = current.requests.filterNot { it.id == request.id }
        val result = if (decision == "accept") "Sample tests passed. No commands were run." else "Sample test run declined."
        _chats.value += agentId to current.copy(requests = remaining, items = current.items + item("assistant", result))
        updateAgent(agentId, remaining.isNotEmpty(), result)
    }

    private fun updateAgent(id: String, needsInput: Boolean, lastLine: String) {
        _agents.value = _agents.value.map {
            if (it.agentId == id) it.copy(attention = if (needsInput) "needs_input" else "idle", lastLine = lastLine) else it
        }
    }

    private fun item(kind: String, text: String) = ChatItem("demo-item-${++nextId}", kind, text, null)
    private fun chat(text: String) = ChatState("idle", "Demo", listOf(item("assistant", text)), emptyList(), null)
    private fun agent(id: String, name: String, attention: String, lastLine: String) = RemoteAgent(
        agentId = id, taskId = id, taskName = name, running = true, exitCode = null,
        lastLine = lastLine, projectName = "Sample project", agentName = "Demo agent", attention = attention, isChat = true,
    )
}
