/************************************************************
 *  EPA-DUNK STATION — ARDUINO MKR ZERO CONTROLLER
 *  4 encoders + 3 knappar
 *  
 *  Hardware:
 *  - 4 rotary encoders (CLK, DT pins)
 *  - 3 buttons (digital pins)
 *  
 *  Output: JSON via Serial (115200 baud)
 ************************************************************/

// ==========================================================
//  ENCODER PINS (CLK, DT)
// ==========================================================
#define ENCODER_TEMPO_CLK   2
#define ENCODER_TEMPO_DT    3
#define ENCODER_TYP_CLK     4
#define ENCODER_TYP_DT      5
#define ENCODER_ENERGI_CLK  6
#define ENCODER_ENERGI_DT   7
#define ENCODER_TRUMMOR_CLK 8
#define ENCODER_TRUMMOR_DT  9

// ==========================================================
//  BUTTON PINS
// ==========================================================
#define BUTTON_BASSPLUS     10
#define BUTTON_DIST         11
#define BUTTON_IGNITION     12

// ==========================================================
//  ENCODER STATE
// ==========================================================
struct Encoder {
  int clkPin;
  int dtPin;
  int lastClkState;
  int value;  // 0-100
  String name;
};

Encoder encoders[4] = {
  {ENCODER_TEMPO_CLK, ENCODER_TEMPO_DT, HIGH, 50, "tempo"},
  {ENCODER_TYP_CLK, ENCODER_TYP_DT, HIGH, 50, "typ"},
  {ENCODER_ENERGI_CLK, ENCODER_ENERGI_DT, HIGH, 50, "energi"},
  {ENCODER_TRUMMOR_CLK, ENCODER_TRUMMOR_DT, HIGH, 50, "trummor"}
};

// ==========================================================
//  BUTTON STATE
// ==========================================================
struct Button {
  int pin;
  int lastState;
  bool pressed;
  String name;
};

Button buttons[3] = {
  {BUTTON_BASSPLUS, HIGH, false, "bassPlus"},
  {BUTTON_DIST, HIGH, false, "dist"},
  {BUTTON_IGNITION, HIGH, false, "ignition"}
};

// ==========================================================
//  SETUP
// ==========================================================
void setup() {
  Serial.begin(115200);
  
  // Setup encoder pins
  for (int i = 0; i < 4; i++) {
    pinMode(encoders[i].clkPin, INPUT_PULLUP);
    pinMode(encoders[i].dtPin, INPUT_PULLUP);
    encoders[i].lastClkState = digitalRead(encoders[i].clkPin);
  }
  
  // Setup button pins
  for (int i = 0; i < 3; i++) {
    pinMode(buttons[i].pin, INPUT_PULLUP);
    buttons[i].lastState = digitalRead(buttons[i].pin);
  }
  
  // Wait for serial connection
  while (!Serial) {
    delay(10);
  }
  
  delay(1000);
  Serial.println("EPA-Dunk Controller Ready");
}

// ==========================================================
//  READ ENCODER
// ==========================================================
void readEncoder(Encoder &enc) {
  int clkState = digitalRead(enc.clkPin);
  
  if (clkState != enc.lastClkState) {
    int dtState = digitalRead(enc.dtPin);
    
    if (dtState != clkState) {
      // Rotating clockwise
      enc.value = min(100, enc.value + 1);
    } else {
      // Rotating counter-clockwise
      enc.value = max(0, enc.value - 1);
    }
    
    enc.lastClkState = clkState;
    
    // Send update immediately
    sendEncoderUpdate(enc.name, enc.value);
  }
}

// ==========================================================
//  READ BUTTON
// ==========================================================
void readButton(Button &btn) {
  int currentState = digitalRead(btn.pin);
  
  // Button state changed
  if (currentState != btn.lastState) {
    delay(50); // Debounce
    int debouncedState = digitalRead(btn.pin);
    
    if (debouncedState != btn.lastState) {
      // Button pressed (LOW because of INPUT_PULLUP)
      if (debouncedState == LOW) {
        btn.pressed = true;
        sendButtonPress(btn.name, true);
      } 
      // Button released (HIGH)
      else {
        btn.pressed = false;
        sendButtonPress(btn.name, false);
      }
      
      btn.lastState = debouncedState;
    }
  }
}

// ==========================================================
//  SEND ENCODER UPDATE (JSON)
// ==========================================================
void sendEncoderUpdate(String name, int value) {
  Serial.print("{\"type\":\"encoder\",\"name\":\"");
  Serial.print(name);
  Serial.print("\",\"value\":");
  Serial.print(value);
  Serial.println("}");
}

// ==========================================================
//  SEND BUTTON PRESS (JSON)
// ==========================================================
void sendButtonPress(String name, bool pressed) {
  Serial.print("{\"type\":\"button\",\"name\":\"");
  Serial.print(name);
  Serial.print("\",\"pressed\":");
  Serial.print(pressed ? "true" : "false");
  Serial.println("}");
}

// ==========================================================
//  MAIN LOOP
// ==========================================================
void loop() {
  // Read all encoders
  for (int i = 0; i < 4; i++) {
    readEncoder(encoders[i]);
  }
  
  // Read all buttons
  for (int i = 0; i < 3; i++) {
    readButton(buttons[i]);
  }
  
  delay(1); // Small delay for stability
}
