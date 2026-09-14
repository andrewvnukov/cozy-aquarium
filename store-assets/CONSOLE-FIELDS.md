# Поля черновика — Тёплый Аквариум

Все тексты уже подогнаны под лимиты консоли (в скобках — длина/лимит).

## Общие настройки черновика (вкладка «Черновик», верх страницы)

| Поле | Что ставить |
|------|-------------|
| **Поддерживаемые платформы** | Десктоп + Мобильные (телефоны и планшеты) — игра адаптивная, управление мышью и тачем |
| **Ориентация** | Любая — сцена подстраивается под ширину окна, HUD держится в колонке до 560 px |
| **Игра переведена на** | Русский, Английский |
| **Возрастной рейтинг** | 0+ |
| **Категории** | Казуальные (одна категория — не смешивать с «Симулятор») |
| **Игра использует облачные сохранения** | ВКЛЮЧИТЬ — прогресс пишется через `player.setData/getData` |
| **Отсроченная публикация** | Выключено |


**Теги**: `мерж, кликер, аквариум, коллекция, уютная` (RU) / `merge, clicker, aquarium, collection, cozy` (EN)

**Ключевые слова** RU (65/100): `аквариум, рыбки, мерж, кликер, коллекция, жемчуг, питомцы, уютная`

**Ключевые слова** EN (68/100): `aquarium, fish, merge, clicker, collection, pearls, pets, cozy, idle`

**Комментарий разработчика** (928/2048):

```
Игра полностью работает офлайн-фолбэком и через Yandex Games SDK.
— SDK подключён из официального источника, LoadingAPI.ready() вызывается после реальной загрузки игры, GameplayAPI.start()/stop() — на старте, при потере фокуса вкладки и вокруг рекламы.
— Язык интерфейса определяется через ysdk.environment.i18n.lang; дополнительно есть ручной переключатель RU/EN (выбор сохраняется в облачном сейве).
— Прогресс сохраняется через player.setData/getData с фолбэком в localStorage.
— Реклама: fullscreen не чаще раза в 3 минуты и только по событию покупки рыбки, никогда на старте; два rewarded-действия с явной наградой на кнопке («Мульти-тап» на 2 минуты и «Доход ×2» на 5 минут). Звук игры паузится на время показа рекламы и при потере фокуса страницы.
— Вся графика и музыка процедурные (Canvas2D + синтез звука), чужих ассетов нет.
— Игра проверена на портретной и альбомной ориентации, на мобильном и десктопном управлении.
```

**Иконка / обложка / скриншоты** — из папки `store-assets/`: `icon.png` (512×512), `cover.png` (RU) и `cover-en.png` (EN) 800×470, скриншоты `d1-start … d5-collection` (RU без суффикса, EN с `-en`). Архив: `cozy-aquarium-yandex.zip`.

---

## Описание и продвижение → вкладка «Русский»

### Название (15/50)

```
Тёплый Аквариум
```

### Описание для SEO (138/160)

```
Тёплый Аквариум — уютный мерж-кликер про рыбок: тапай за жемчугом, расти мальков, объединяй одинаковых и собери коллекцию из девяти видов.
```

### Короткое описание (60/70)

```
Тапай рыбок, расти мальков и объединяй — 30 видов аквариума!
```

### Об игре (972/1000)

```
Тёплый Аквариум — уютный мерж-кликер про домашний аквариум.

Тапайте по рыбке — она приносит жемчуг, и над ней всплывает награда. Тап по воде рыбок не тревожит: по ней просто расходится рябь.

На жемчуг покупайте мальков. Малёк подрастает за несколько секунд, а когда становится взрослым — перетащите его на такую же взрослую рыбку, и они объединятся в рыбку следующего уровня. Так из простых гуппи получаются кардинал, неон, данио, барбус, петушок, дискус, крылатка и другие — всего тридцать настоящих видов.

Корм тоже покупается за жемчуг: хлопья тонут, рыбки не спеша едят и наполняют шкалу сытости. Сытая рыбка платит вдвое больше за тап и быстрее растёт. Сытость постепенно тает — загляните покормить питомцев снова.

Улучшайте аквариум: сытный корм насыщает сильнее, аэратор повышает фоновый доход, водоросли удешевляют мальков. Каждый день ждёт бесплатный подарок.

Живой подводный мир — лучи света, водоросли, кораллы, медуза и краб на дне — успокаивает и радует.
```

### Как играть (997/1000)

```
1. Тапайте по рыбке — она приносит жемчуг. Тап по пустой воде дохода не даёт, только рябь.

2. Нажмите «Купить», чтобы завести малька; в магазине доступны все открытые виды. Малёк меньше взрослой рыбы, над ним голубая шкала роста: первый вид растёт около пяти секунд, старшие — дольше. У каждого вида свой характер: одни носятся, другие держатся стайкой, третьи копошатся у дна.

3. Когда две рыбки одного вида выросли, зажмите одну и перетащите на вторую — цель подсветится кругом. Отпустите: получится малёк следующего вида, а сам вид откроется в магазине.

4. «Покормить» бросает корм: рыбки едят не спеша. Когда зелёная шкала дойдёт до золотой риски, рыбка сыта — платит вдвое больше за тап и растёт быстрее. Сытость постепенно тает.

5. «Мульти-тап» после видео две минуты собирает жемчуг со всех рыбок. А краб на дне иногда выносит табличку «Доход ×2» — тапните по нему, чтобы удвоить фоновый доход.

6. Боковые кнопки — магазин, улучшения и настройки. Пока игра закрыта, рыбки копят жемчуг.
```

---

## Описание и продвижение → вкладка «Английский»

### Название (13/50)

```
Cozy Aquarium
```

### Описание для SEO (120/160)

```
Cozy Aquarium is a merge-clicker about fish: tap for pearls, grow fry, merge matching ones and collect all nine species.
```

### Короткое описание (51/70)

```
Tap fish, grow fry and merge them into new species!
```

### Об игре (971/1000)

```
Cozy Aquarium is a warm little merge-clicker about a home fish tank.

Tap a fish and it pays out pearls, with the reward popping up above it. Tapping the water leaves your fish alone — it just sends out a ripple.

Spend pearls on fry. A fry grows up in seconds, and once it is an adult you can drag it onto a matching adult fish to merge them into the next level. Simple guppies become white clouds, neon tetras, danios, barbs, bettas, discus, lionfish and more — thirty real species in all.

Food costs pearls too: the flakes sink, fish eat unhurriedly and fill their satiety bar. A well-fed fish pays double per tap and grows faster. Satiety slowly fades, so drop by to feed your pets again.

Upgrade the tank: rich food is more filling, the aerator raises background income, water plants make fry cheaper. A free gift waits for you every day.

A living underwater world — light rays, plants, corals, a jellyfish and a crab on the sand — keeps things calm and cheerful.
```

### Как играть (1000/1000)

```
1. Tap a fish — it pays out pearls. Tapping empty water gives nothing, just a ripple.

2. Press "Buy fry" to add a fry; the shop sells every unlocked species. A fry is smaller than an adult and shows a blue growth bar: the first species grows in about five seconds, later ones take longer. Each species swims differently: some dart, some school, some potter along the bottom.

3. When two fish of the same species are grown, drag one onto the other — a valid target lights up. Release to merge them into a fry of the next species, which unlocks in the shop.

4. "Feed" drops food and fish eat unhurriedly. Once the green bar reaches the golden mark the fish is full — double pearls per tap and faster growth. Satiety slowly fades.

5. "Multi-tap" after a video collects from every fish on any tap for two minutes. The crab sometimes holds an "Income ×2" sign — tap him to double background income.

6. The side buttons open the shop, upgrades and settings. Fish keep earning while the game is closed.
```
