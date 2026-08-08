---
layout: single
title: "Contact"
permalink: /contact/
author_profile: false
contact_form: true
---

<div class="contact-page">
  <div class="lang-en">
    <h1>Contact</h1>
    <p>Use this form for job opportunities, collaborations, or questions about my work.</p>
  </div>

  <div class="lang-fr">
    <h1>Contact</h1>
    <p>Utilisez ce formulaire pour une opportunité professionnelle, une collaboration ou une question sur mon travail.</p>
  </div>

  <form
    id="contact-form"
    class="contact-form"
    action="https://formspree.io/f/myegkljv"
    method="POST"
    accept-charset="UTF-8"
    data-contact-form
  >
    <p class="contact-form__required-note">
      <span class="lang-en">All fields are required.</span>
      <span class="lang-fr">Tous les champs sont obligatoires.</span>
    </p>

    <div class="contact-form__field">
      <label for="contact-name">
        <span class="lang-en">Name</span>
        <span class="lang-fr">Nom</span>
      </label>
      <input
        id="contact-name"
        name="name"
        type="text"
        autocomplete="name"
        minlength="1"
        maxlength="80"
        aria-describedby="contact-name-hint contact-name-error"
        required
      >
      <p id="contact-name-hint" class="contact-form__hint">
        <span class="lang-en">80 characters maximum.</span>
        <span class="lang-fr">80 caractères maximum.</span>
      </p>
      <p id="contact-name-error" class="contact-form__error" data-contact-error-for="name"></p>
    </div>

    <div class="contact-form__field">
      <label for="contact-email">
        <span class="lang-en">Email</span>
        <span class="lang-fr">Courriel</span>
      </label>
      <input
        id="contact-email"
        name="email"
        type="email"
        autocomplete="email"
        maxlength="254"
        inputmode="email"
        aria-describedby="contact-email-hint contact-email-error"
        required
      >
      <p id="contact-email-hint" class="contact-form__hint">
        <span class="lang-en">Used only to reply to your message.</span>
        <span class="lang-fr">Utilisé uniquement pour répondre à votre message.</span>
      </p>
      <p id="contact-email-error" class="contact-form__error" data-contact-error-for="email"></p>
    </div>

    <div class="contact-form__field">
      <label for="contact-subject">
        <span class="lang-en">Subject</span>
        <span class="lang-fr">Sujet</span>
      </label>
      <input
        id="contact-subject"
        name="subject"
        type="text"
        minlength="1"
        maxlength="120"
        aria-describedby="contact-subject-hint contact-subject-error"
        required
      >
      <p id="contact-subject-hint" class="contact-form__hint">
        <span class="lang-en">120 characters maximum.</span>
        <span class="lang-fr">120 caractères maximum.</span>
      </p>
      <p id="contact-subject-error" class="contact-form__error" data-contact-error-for="subject"></p>
    </div>

    <div class="contact-form__field">
      <label for="contact-message">
        <span class="lang-en">Message</span>
        <span class="lang-fr">Message</span>
      </label>
      <textarea
        id="contact-message"
        name="message"
        rows="8"
        minlength="10"
        maxlength="5000"
        aria-describedby="contact-message-hint contact-message-error"
        required
      ></textarea>
      <p id="contact-message-hint" class="contact-form__hint">
        <span class="lang-en">10 to 5,000 characters.</span>
        <span class="lang-fr">10 à 5 000 caractères.</span>
      </p>
      <p id="contact-message-error" class="contact-form__error" data-contact-error-for="message"></p>
    </div>

    <div class="contact-form__honeypot" aria-hidden="true">
      <label for="contact-company">
        <span class="lang-en">Leave this field empty</span>
        <span class="lang-fr">Laissez ce champ vide</span>
      </label>
      <input id="contact-company" name="_gotcha" type="text" tabindex="-1" autocomplete="off">
    </div>

    <div class="contact-form__actions">
      <button class="btn btn--primary contact-form__submit" type="submit" data-contact-submit>
        <span data-contact-submit-idle>
          <span class="lang-en">Send message</span>
          <span class="lang-fr">Envoyer le message</span>
        </span>
        <span data-contact-submit-loading hidden>
          <span class="lang-en">Sending…</span>
          <span class="lang-fr">Envoi…</span>
        </span>
      </button>
    </div>

    <p
      id="contact-form-status"
      class="contact-form__status"
      role="status"
      aria-live="polite"
      tabindex="-1"
      data-contact-status
    ></p>
  </form>

  <p class="contact-page__privacy">
    <span class="lang-en">Form data is processed by <a href="https://formspree.io/legal/privacy-policy/">Formspree</a> and used only to respond to your message.</span>
    <span class="lang-fr">Les données du formulaire sont traitées par <a href="https://formspree.io/legal/privacy-policy/">Formspree</a> et utilisées uniquement pour répondre à votre message.</span>
  </p>
</div>
