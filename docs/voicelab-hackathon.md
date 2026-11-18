# MehrAI appointment confirmation in VoiceLab Studio

Create a separate Uzbek-language agent named **MehrAI — Qabulni tasdiqlash (sinov)**. Use a fictional visit and a team member's own number or a teammate who agreed to participate. Keep the destination number in Studio or private server configuration.

## Opening message

> Assalomu alaykum. Men MehrAI sinov qo‘ng‘irog‘idagi sun’iy intellekt yordamchisiman. Bu demo, haqiqiy tibbiy qabul belgilanmaydi. Namuna qabul payshanba kuni soat 15:00 da. Shu vaqt sizga mos keladimi?

## Agent instructions

```text
O‘zbek tilida qisqa va aniq gapiring. Suhbat faqat sinov uchun.
Namuna qabul payshanba kuni soat 15:00 da. Shu vaqt mos kelishini so‘rang.
Agar suhbatdosh rozi bo‘lsa, namuna vaqt mos kelganini qayd eting.
Agar suhbatdosh boshqa vaqt so‘rasa, so‘rovni qayd eting. Yangi vaqt tayinlamang.
Javob tushunarsiz bo‘lsa, savolni bir marta takrorlang. Natija noaniq qolsa, xodim tekshiruvi kerakligini qayd eting.
Ism, telefon, pasport yoki tibbiy ma’lumot so‘ramang. Tashxis yoki tibbiy maslahat bermang.
Natijani qisqacha ayting, rahmat bildiring va suhbatni yakunlang.
```

## Test and record the result

1. Open **Deploy → Outbound** in VoiceLab Studio. If the workspace exposes a single-recipient phone test, select the MehrAI agent and an eligible caller ID. Use only the agreed test destination.
2. Review the result in **Conversations**. In the local MehrAI app, open a sample case with a facility-proposed timed visit and record the result under **Bemor bilan bog‘lanish**.
3. A confirmation applies to that existing sample visit. A request for another time returns the case to the facility response queue. Record no answer only if the call record shows no answer. Leave ambiguous results for staff review.

## Contract needed to automate the call

From **Developer**, **Outbound**, or VoiceLab support, obtain a supported outbound call example with its auth type, agent and caller IDs, destination format, response call ID, and result callback or status lookup. For callbacks, get the signature verification instructions and event example. Keep key values and real numbers out of the example.

[VoiceLab Agents](https://voicelab.uz/agents) · [Public developer API limits](https://docs.voicelab.uz/api/errors#what-is-not-a-developer-api-yet)
