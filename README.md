# file-organizer

CLI-інструмент на Node.js для аналізу директорії, пошуку дублікатів, сортування файлів за категоріями та видалення застарілих даних.

## Вимоги

- Node.js 18+ (ES Modules)

## Встановлення

```bash
npm install
```

## Команди

```bash
node file-organizer.js scan <directory>
node file-organizer.js duplicates <directory>
node file-organizer.js organize <source> --output <target>
node file-organizer.js cleanup <directory> --older-than <days> [--confirm]
```

Або через npm scripts:

```bash
npm run scan -- /path/to/directory
npm run duplicates -- /path/to/directory
npm run organize -- /path/to/directory --output /path/to/organized
npm run cleanup -- /path/to/directory --older-than 90
npm run cleanup -- /path/to/directory --older-than 90 --confirm
```

### `scan`

Рекурсивно сканує директорію та показує статистику: кількість і розмір файлів, типи, вік, топ-3 найбільших файли та найстаріший файл.

### `duplicates`

Обчислює SHA-256 для кожного файлу через streams і групує копії з однаковим вмістом. Витрачене місце = розмір файлу × (кількість копій − 1).

### `organize`

Копіює файли в цільову директорію по категоріях: `Documents`, `Images`, `Archives`, `Code`, `Videos`, `Other`. Оригінали не змінюються. Файли ≥ 10 MB копіюються через `pipeline()`, менші — через `fs.copyFile()`. Якщо ім’я вже зайняте, додається суфікс `(1)`, `(2)` тощо.

### `cleanup`

Знаходить файли, змінені раніше ніж `--older-than` днів. Без `--confirm` працює в dry run режимі (нічого не видаляє). З `--confirm` видаляє знайдені файли.

## Структура

```
file-organizer/
├── package.json
├── .gitignore
├── README.md
├── file-organizer.js
└── lib/
    ├── scanner.js
    ├── duplicates.js
    ├── organizer.js
    ├── cleanup.js
    └── utils.js
```
