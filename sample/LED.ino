const int ledPin = 13;
bool ledState = false;          // Initial state: OFF
unsigned long sendTimer = 0;
const long sendInterval = 1000; // Report status every 1 seconds

void setup() {
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);
  Serial.begin(9600);
}

void loop() {
  // Report current LED status every 3 seconds (Standard JSON format)
  if (millis() - sendTimer >= sendInterval) {
    sendTimer = millis();
    if (ledState) {
      Serial.println("{\"led\":\"on\"}");
    } else {
      Serial.println("{\"led\":\"off\"}");
    }
  }

  // Read serial JSON command, parse and set LED state
  if (Serial.available() > 0) {
    String recvStr = Serial.readStringUntil('\n');
    recvStr.trim();
    if (recvStr.length() == 0) return;

    // Simple JSON string parsing, with plain-text fallback (on / off / 1 / 0)
    if (recvStr.indexOf("\"led\":\"on\"") != -1 || recvStr == "on" || recvStr == "1") {
      ledState = true;
      digitalWrite(ledPin, HIGH);
    } else if (recvStr.indexOf("\"led\":\"off\"") != -1 || recvStr == "off" || recvStr == "0") {
      ledState = false;
      digitalWrite(ledPin, LOW);
    }
  }
}
