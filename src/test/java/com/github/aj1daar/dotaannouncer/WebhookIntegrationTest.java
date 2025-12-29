package com.github.aj1daar.dotaannouncer;

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot;
import com.github.aj1daar.dotaannouncer.model.Match;
import com.github.aj1daar.dotaannouncer.repository.MatchRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "telegram.bot-token=test_token_123",
        "telegram.bot-username=TestBot",
        "telegram.admin-chat-id=12345",
        "pandascore.token=test_panda_token"
    }
)
@Testcontainers
@ActiveProfiles("test")
class WebhookIntegrationTest {

  @Container
  @ServiceConnection
  static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:latest");

  @LocalServerPort
  private Integer port;

  @Autowired
  private MatchRepository matchRepository;

  @MockitoBean
  private DotaTelegramBot dotaTelegramBot;

  @BeforeEach
  void setUp() {
    RestAssured.baseURI = "http://localhost:" + port;
    matchRepository.deleteAll();
  }

  @Test
  void shouldSaveMatch_WhenWebhookReceived() {
    String jsonPayload = """
            {
              "type": "match_created",
              "event_id": "evt_TEST_123",
              "created_at": "2025-12-13T12:00:00Z",
              "payload": {
                "object": {
                  "id": 1001,
                  "name": "Team Liquid vs Gaimin Gladiators",
                  "begin_at": "2025-12-30T20:00:00Z",
                  "number_of_games": 3,
                  "league": { "name": "Riyadh Masters 2025" },
                  "opponents": [
                    { "opponent": { "id": 1, "name": "Team Liquid" } },
                    { "opponent": { "id": 2, "name": "Gaimin Gladiators" } }
                  ]
                }
              }
            }
        """;

    RestAssured.given()
        .contentType(ContentType.JSON)
        .body(jsonPayload)
        .when()
        .post("/api/webhooks/pandascore")
        .then()
        .statusCode(200);

    List<Match> matches = matchRepository.findAll();
    assertThat(matches).hasSize(1);
    assertThat(matches.getFirst().getTeamOne()).isEqualTo("Team Liquid");
    assertThat(matches.getFirst().getTournamentName()).isEqualTo("Riyadh Masters 2025");
  }
}