package com.github.aj1daar.dotaannouncer;

import com.github.aj1daar.dotaannouncer.config.DotenvConfig;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class DotaMatchAnnouncerApplication {

	public static void main(String[] args) {
		SpringApplication app = new SpringApplication(DotaMatchAnnouncerApplication.class);
		app.addInitializers(new DotenvConfig());
		app.run(args);
	}

}
