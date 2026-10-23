package com.parallelcode.phone

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Reuses the real task cards and approval/chat transcript without a RemoteClient. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DemoScreen(session: DemoSession, onExit: () -> Unit) {
    val agents by session.agents.collectAsState()
    val chats by session.chats.collectAsState()
    var selected by remember(session) { mutableStateOf<String?>(null) }
    var creating by remember(session) { mutableStateOf(false) }
    BackHandler {
        if (selected != null || creating) {
            selected = null
            creating = false
        } else onExit()
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Demo mode") },
                navigationIcon = {
                    if (selected != null || creating) TextButton(onClick = {
                        selected = null
                        creating = false
                    }) { Text("Back") }
                },
                actions = { TextButton(onClick = onExit) { Text("Exit demo") } },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
            Text(
                "Sample data · offline · changes disappear when you exit",
                modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall,
            )
            val agentId = selected
            when {
                creating -> {
                    Text("New sample task", Modifier.padding(12.dp), style = MaterialTheme.typography.titleMedium)
                    DemoComposer("Describe a sample task", "Create task") {
                        selected = session.createTask(it)
                        creating = false
                    }
                }
                agentId != null -> {
                    val chat = chats[agentId]
                    Text(agents.firstOrNull { it.agentId == agentId }?.taskName.orEmpty(), Modifier.padding(12.dp))
                    if (chat != null) key(agentId) {
                        ChatTranscript(
                            agentId = agentId, chat = chat, agentName = "Demo agent", canRespond = true,
                            respond = { request, decision, _ -> session.respond(agentId, request, decision) },
                            modifier = Modifier.weight(1f),
                        )
                        DemoComposer("Message the demo agent", "Send") { session.send(agentId, it) }
                    }
                }
                else -> {
                    OutlinedButton(onClick = { creating = true }, modifier = Modifier.padding(horizontal = 12.dp)) {
                        Text("New sample task")
                    }
                    LazyColumn(
                        modifier = Modifier.weight(1f).padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(agents, key = { it.agentId }) { agent ->
                            AgentCard(agent, onOpen = { selected = it.agentId })
                        }
                    }
                }
            }
        }
    }
}

/** Intentionally no saved draft, prompt history, speech recognizer or service access. */
@Composable
private fun DemoComposer(label: String, action: String, onSend: (String) -> Unit) {
    var text by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().padding(12.dp)) {
        OutlinedTextField(
            value = text, onValueChange = { text = it }, label = { Text(label) },
            modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4,
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            OutlinedButton(onClick = { onSend(text); text = "" }, enabled = text.isNotBlank()) { Text(action) }
        }
    }
}
