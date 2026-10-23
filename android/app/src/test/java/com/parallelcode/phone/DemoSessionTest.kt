package com.parallelcode.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DemoSessionTest {
    @Test
    fun samplesIncludeAnActionableApprovalAndAChat() {
        val session = DemoSession()
        assertEquals(2, session.agents.value.size)
        assertTrue(session.agents.value.all { it.isChat && it.agentId.startsWith("demo-") })
        val review = session.agents.value.first { it.attention == "needs_input" }
        val request = session.chats.value.getValue(review.agentId).requests.single()
        session.respond(review.agentId, request, "accept")
        assertTrue(session.chats.value.getValue(review.agentId).requests.isEmpty())
        assertEquals("idle", session.agents.value.first { it.agentId == review.agentId }.attention)
        assertTrue(session.chats.value.getValue(review.agentId).items.last().text.contains("No commands were run"))
    }

    @Test
    fun decliningApprovalDoesNotRunTheSampleTests() {
        val session = DemoSession()
        val request = session.chats.value.getValue("demo-review").requests.single()
        session.respond("demo-review", request, "decline")
        assertEquals("Sample test run declined.", session.chats.value.getValue("demo-review").items.last().text)
    }

    @Test
    fun createsTasksAndRepliesLocallyWithoutChangingOtherTasks() {
        val session = DemoSession()
        val original = session.chats.value.getValue("demo-tests")
        val id = session.createTask("  Review accessibility  ")
        assertEquals("Review accessibility", session.agents.value.last().taskName)
        session.send(id, "  Add labels  ")
        val items = session.chats.value.getValue(id).items
        assertEquals("Add labels", items[items.lastIndex - 1].text)
        assertTrue(items.last().text.startsWith("Demo reply received"))
        assertEquals(items.size, items.map { it.id }.distinct().size)
        assertEquals(original, session.chats.value.getValue("demo-tests"))
        assertTrue(session.chats.value.getValue("demo-review").requests.isNotEmpty())
    }

    @Test
    fun aNewSessionDiscardsAllEditsAndRestoresTheApproval() {
        val previous = DemoSession()
        val id = previous.createTask("Private demo draft")
        previous.send(id, "Private demo reply")
        val fresh = DemoSession()
        assertEquals(2, fresh.agents.value.size)
        assertFalse(fresh.chats.value.containsKey(id))
        assertTrue(fresh.chats.value.getValue("demo-review").requests.isNotEmpty())
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsEmptyTasks() {
        DemoSession().createTask(" \n ")
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsEmptyReplies() {
        DemoSession().send("demo-review", " ")
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsReplayingAnApproval() {
        val session = DemoSession()
        val request = session.chats.value.getValue("demo-review").requests.single()
        session.respond("demo-review", request, "accept")
        session.respond("demo-review", request, "accept")
    }
}
