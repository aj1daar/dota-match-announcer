package com.github.aj1daar.dotaannouncer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class DotaMatchAnnouncerApplication {

	public static void main(String[] args) {
		SpringApplication.run(DotaMatchAnnouncerApplication.class, args);
	}

}
