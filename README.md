# Taskcards Board Export/Import für NBC

Tampermonkey-Script zum Exportieren von Taskcards-Boards im JSON-Format für den Import in die Niedersächsische Bildungscloud (NBC).

## Version 2.1 - Automatischer Import!

🎉 **NEU: Automatischer Import für Kanban-Boards!**
- Importierte Boards werden jetzt **automatisch auf Taskcards nachgebaut**
- Spalten und Karten werden per UI-Automation erstellt
- Titel und Inhalte werden automatisch übertragen

✨ **Unterstützt beide Board-Typen:**
- **Kanban/Pinnwand-Boards** mit Spalten und Karten (Export + automatischer Import)
- **Tafel/Chalkboard-Boards** mit frei positionierbaren Karten und Verbindungen (Export)

## Features

### Export-Funktionalität
- Vollständiger Export aller Board-Inhalte für beide Board-Typen
- **Kanban-Boards:** Erfasst Spalten, Karten und deren Reihenfolge
- **Tafel-Boards:** Erfasst Karten mit Positionen, Größen und Verbindungen
- Extrahiert Titel, Beschreibungen, HTML-Inhalte
- Sichert Anhänge (Bilder) mit S3-URLs und Dateinamen
- Exportiert Board-Links (Thumbnails zu anderen Boards)
- Erkennt eingebettete Videos und Medien
- Speichert Styling-Informationen (Farben, Hintergründe)
- JSON-Format für einfache Weiterverarbeitung

### Import-Funktionalität
- Lädt JSON-Export-Dateien
- Zeigt detaillierte Vorschau der Board-Struktur
- Unterscheidet zwischen Kanban und Tafel
- **NEU: Automatischer Import für Kanban-Boards**
  - Erstellt Spalten automatisch
  - Erstellt Karten mit Titel und Inhalt
  - Nutzt UI-Automation für nahtlose Integration
  - Zeigt Fortschritt während des Imports
- Validierung der Daten
- Ausgabe in Browser-Konsole für NBC-Import
- Zwischenablage-Funktion für schnelles Kopieren

### Exportierte Datenstruktur

Das Script exportiert unterschiedliche Strukturen je nach Board-Typ:

#### Kanban/Pinnwand-Board:
```json
{
  "version": "2.0.0",
  "exportDate": "ISO-Datum",
  "platform": "taskcards",
  "targetPlatform": "niedersaechsische-bildungscloud",
  "board": {
    "id": "board-id",
    "type": "kanban",
    "title": "Board-Titel",
    "description": "Board-Beschreibung",
    "author": "Autor-Name",
    "metadata": {
      "trendscore": "Trendscore",
      "lastModified": "Letzte Änderung"
    },
    "columns": [
      {
        "id": "column-id",
        "position": 0,
        "title": "Spalten-Titel",
        "cards": [
          {
            "id": "card-id",
            "position": 0,
            "title": "Karten-Titel",
            "content": "Text-Inhalt",
            "htmlContent": "HTML-Inhalt",
            "attachments": [
              {
                "type": "image",
                "url": "S3-URL",
                "alt": "Alt-Text",
                "filename": "spritze.png"
              }
            ],
            "embeds": [
              {
                "type": "board-link",
                "title": "Verlinktes Board",
                "author": "Autor"
              }
            ],
            "style": {
              "backgroundColor": "rgb(255, 255, 255)",
              "color": "rgb(23, 68, 130)",
              "zoom": "1"
            }
          }
        ]
      }
    ],
    "settings": {
      "backgroundImage": "url(...)",
      "backgroundColor": "rgb(221, 140, 60)",
      "backgroundSize": "cover"
    }
  },
  "stats": {
    "type": "kanban",
    "totalColumns": 3,
    "totalCards": 18,
    "totalAttachments": 1,
    "totalEmbeds": 1
  }
}
```

#### Tafel/Chalkboard-Board:
```json
{
  "version": "2.0.0",
  "board": {
    "type": "chalkboard",
    "cards": [
      {
        "id": "card-id",
        "position": {
          "x": 340,
          "y": 26,
          "width": 576,
          "height": 260
        },
        "title": "Karten-Titel",
        "content": "Text-Inhalt",
        "htmlContent": "<ol><li>Aufgabe 1</li></ol>",
        "attachments": [...],
        "embeds": [...],
        "style": {
          "backgroundColor": "rgb(255, 255, 255)",
          "color": "rgb(23, 68, 130)"
        }
      }
    ],
    "connections": [
      {
        "id": "connection-id",
        "position": {
          "left": 230,
          "top": 112,
          "width": 130,
          "height": 63
        },
        "label": "Zur Wiederholung",
        "style": {
          "d": "SVG-Pfad",
          "stroke": "#ffffff",
          "strokeWidth": "2.6"
        }
      }
    ]
  },
  "stats": {
    "type": "chalkboard",
    "totalCards": 9,
    "totalConnections": 7,
    "totalAttachments": 2
  }
}
```

## Installation

1. **Tampermonkey installieren**
   - Chrome: [Tampermonkey im Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/)
   - Firefox: [Tampermonkey für Firefox](https://addons.mozilla.org/de/firefox/addon/tampermonkey/)
   - Edge: [Tampermonkey für Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/)

2. **Script installieren**
   - Öffne Tampermonkey Dashboard
   - Klicke auf das "+" Symbol (Neues Script erstellen)
   - Kopiere den Inhalt von `taskcards-export-import.user.js`
   - Speichere das Script (Strg+S)

3. **Script aktivieren**
   - Das Script ist automatisch aktiv auf taskcards.de
   - Beim Besuch von Taskcards erscheinen zwei Buttons rechts oben

## Verwendung

### Board exportieren

1. Öffne ein Board auf taskcards.de
2. Klicke auf den Button "📥 Board exportieren" (rechts oben)
3. Das Board wird als JSON-Datei heruntergeladen
4. Dateiname: `taskcards_board_[TITEL]_[DATUM].json`

### Board importieren (zum Testen)

1. Klicke auf den Button "📤 Board importieren" (rechts oben)
2. Wähle eine zuvor exportierte JSON-Datei aus
3. Ein Modal zeigt die Vorschau des Boards
4. Die Daten werden in der Browser-Konsole ausgegeben
5. Nutze "📋 JSON in Zwischenablage kopieren" für einfaches Kopieren

### Automatischer Import auf Taskcards (Kanban-Boards)

**NEU in Version 2.1:**

1. Öffne ein **leeres Kanban-Board** auf Taskcards
2. Klicke auf "📤 Board importieren"
3. Wähle eine exportierte JSON-Datei
4. Im Vorschau-Modal klicke auf "🤖 Automatisch importieren"
5. Das Script erstellt automatisch alle Spalten und Karten!

**Der automatische Import:**
- Erstellt Spalten in der richtigen Reihenfolge
- Fügt Karten mit Titeln und Inhalten ein
- Zeigt den Fortschritt während des Imports
- Funktioniert durch simulierte UI-Interaktionen

**Hinweis:** Der automatische Import funktioniert nur auf einem Board, wo du Bearbeitungsrechte hast!

### Import in NBC (Niedersächsische Bildungscloud)

1. Exportiere das Board von Taskcards
2. Öffne die NBC
3. Nutze die NBC-Import-Funktion (falls vorhanden)
4. Lade die JSON-Datei hoch oder füge die Daten ein

**Alternative für manuellen Import:**
1. Nutze die Import-Vorschau im Script
2. Öffne Browser-Entwicklertools (F12)
3. Wechsle zur Konsole
4. Kopiere die JSON-Daten zwischen den Markierungen
5. Nutze diese Daten für die NBC-Integration

## Anpassungen

### Domain-Anpassungen

Falls Taskcards unter einer anderen Domain läuft, passe die `@match` Zeilen an:

```javascript
// @match        https://ihre-domain.de/*
```

### Selektoren anpassen

Falls sich die HTML-Struktur von Taskcards ändert, können die CSS-Selektoren in der Funktion `extractBoardData()` angepasst werden:

```javascript
// Beispiel für Titel-Selektor
const titleElement = document.querySelector('h1.board-title, .board-header h1, [data-board-title], .title');
```

### Erweiterte Datenextraktion

Um zusätzliche Daten zu exportieren, erweitere das `cardData` Objekt:

```javascript
cardData.customField = card.querySelector('.custom-selector')?.textContent || '';
```

## Fehlerbehebung

### Buttons werden nicht angezeigt
- Prüfe ob das Script in Tampermonkey aktiv ist
- Überprüfe die Domain-Einstellungen
- Lade die Seite neu (Strg+F5)

### Export ist leer oder unvollständig
- Die HTML-Struktur von Taskcards könnte sich geändert haben
- Öffne die Browser-Konsole (F12) und prüfe auf Fehler
- Passe die CSS-Selektoren an

### Import funktioniert nicht
- Prüfe ob die JSON-Datei gültig ist
- Validiere das JSON-Format mit einem Online-Validator
- Prüfe die Browser-Konsole auf Fehlermeldungen

## Technische Details

- **Version:** 1.0.0
- **Tampermonkey API:** GM_addStyle, GM_download
- **Kompatibilität:** Chrome, Firefox, Edge (mit Tampermonkey)
- **Ausführung:** document-idle (nach vollständigem Laden der Seite)

## Entwicklung

### Script anpassen

1. Öffne Tampermonkey Dashboard
2. Finde das Script in der Liste
3. Klicke auf "Bearbeiten"
4. Nimm deine Änderungen vor
5. Speichere (Strg+S)
6. Lade die Taskcards-Seite neu

### Debugging

```javascript
// Debug-Modus aktivieren
console.log('=== BOARD DATA ===');
console.log(boardData);
```

## Zukünftige Erweiterungen

- Automatischer Upload zu NBC (API-Integration)
- Batch-Export mehrerer Boards
- Differenz-Import (nur Änderungen)
- Bilder herunterladen und lokal speichern
- Unterstützung für weitere Plattformen
- Automatische Backup-Funktion

## Lizenz

Dieses Script steht unter der MIT-Lizenz und kann frei verwendet und angepasst werden.

## Support

Bei Fragen oder Problemen:
1. Prüfe die Fehlerbehebung oben
2. Öffne ein Issue im Repository
3. Kontaktiere den Entwickler

## Changelog

### Version 2.1.0 (2026-01-07)
- **🎉 NEU:** Automatischer Import für Kanban-Boards
- **NEU:** UI-Automation zum Erstellen von Spalten und Karten
- **NEU:** "Automatisch importieren"-Button im Import-Modal
- **NEU:** Fortschrittsanzeige während des Imports
- **NEU:** `sleep()` Hilfsfunktion für zeitgesteuerte Aktionen
- **NEU:** `createColumn()` - Erstellt Spalten automatisch
- **NEU:** `createCard()` - Erstellt Karten mit Titel und Inhalt
- **NEU:** `importKanbanBoard()` - Orchestriert den vollständigen Import
- **VERBESSERT:** Bessere Fehlerbehandlung beim Import
- Automatisches Setzen von Titeln und HTML-Inhalten

### Version 2.0.0 (2026-01-07)
- **NEU:** Unterstützung für beide Board-Typen (Kanban und Tafel)
- **NEU:** Automatische Erkennung des Board-Typs
- **NEU:** Export von Karten-Positionen und -Größen bei Tafel-Boards
- **NEU:** Export von Verbindungen zwischen Karten (mit Labels und SVG-Pfaden)
- **NEU:** Export von Board-Links (Thumbnails zu anderen Boards)
- **NEU:** Erkennung von eingebetteten Videos und Medien
- **VERBESSERT:** Genauere Extraktion basierend auf echter Taskcards-DOM-Struktur
- **VERBESSERT:** Dateinamen-Extraktion aus S3-URLs
- **VERBESSERT:** Import-Vorschau unterscheidet zwischen Board-Typen
- Angepasst an Taskcards-Selektoren: `.draggableList`, `.chalkboard-card`, `.board-card`
- Optimierte Statistiken je nach Board-Typ

### Version 1.0.0 (2026-01-07)
- Initiale Version
- Export-Funktionalität für Boards
- Import-Funktionalität mit Vorschau
- UI-Buttons und Modal-Dialoge
- JSON-Format optimiert für NBC-Import
