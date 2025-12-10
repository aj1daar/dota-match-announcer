package com.github.aj1daar.dotaannouncer.repository;

import com.github.aj1daar.dotaannouncer.model.Match;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MatchRepository extends JpaRepository<Match, Long> {
    List<Match> findByAnnouncedFalse();
}
