(function () {
  "use strict";

  var form = document.querySelector("[data-contact-form]");
  if (!form) {
    return;
  }

  var submitButton = form.querySelector("[data-contact-submit]");
  var idleLabel = form.querySelector("[data-contact-submit-idle]");
  var loadingLabel = form.querySelector("[data-contact-submit-loading]");
  var statusElement = form.querySelector("[data-contact-status]");

  var messages = {
    en: {
      sending: "Sending your message…",
      success: "Message sent. Thank you.",
      validation: "Check the highlighted fields and try again.",
      field: "Check this field.",
      rateLimit: "Too many messages were sent recently. Please wait and try again.",
      failure: "The message could not be sent. Please try again.",
      network: "The contact service is unavailable. Check your connection and try again."
    },
    fr: {
      sending: "Envoi du message…",
      success: "Message envoyé. Merci.",
      validation: "Vérifiez les champs signalés et réessayez.",
      field: "Vérifiez ce champ.",
      rateLimit: "Trop de messages ont été envoyés récemment. Attendez avant de réessayer.",
      failure: "Le message n’a pas pu être envoyé. Réessayez.",
      network: "Le service de contact est indisponible. Vérifiez votre connexion et réessayez."
    }
  };

  function currentMessages() {
    return document.documentElement.lang === "fr" ? messages.fr : messages.en;
  }

  function errorElementFor(fieldName) {
    var elements = form.querySelectorAll("[data-contact-error-for]");
    for (var index = 0; index < elements.length; index += 1) {
      if (elements[index].getAttribute("data-contact-error-for") === fieldName) {
        return elements[index];
      }
    }
    return null;
  }

  function clearFieldErrors() {
    form.querySelectorAll("[aria-invalid='true']").forEach(function (field) {
      field.removeAttribute("aria-invalid");
    });

    form.querySelectorAll("[data-contact-error-for]").forEach(function (element) {
      element.textContent = "";
    });
  }

  function setStatus(state, message, shouldFocus) {
    statusElement.textContent = message;

    if (state) {
      statusElement.setAttribute("data-state", state);
    } else {
      statusElement.removeAttribute("data-state");
    }

    if (shouldFocus) {
      statusElement.focus();
    }
  }

  function setSubmitting(isSubmitting) {
    submitButton.disabled = isSubmitting;
    form.setAttribute("aria-busy", isSubmitting ? "true" : "false");
    idleLabel.hidden = isSubmitting;
    loadingLabel.hidden = !isSubmitting;
  }

  function applyServerErrors(errors) {
    if (!Array.isArray(errors)) {
      return null;
    }

    var firstInvalidField = null;

    errors.forEach(function (error) {
      if (!error || !error.field) {
        return;
      }

      var field = form.elements.namedItem(error.field);
      var errorElement = errorElementFor(error.field);

      if (field && typeof field.setAttribute === "function") {
        field.setAttribute("aria-invalid", "true");
        firstInvalidField = firstInvalidField || field;
      }

      if (errorElement) {
        errorElement.textContent = currentMessages().field;
      }
    });

    return firstInvalidField;
  }

  form.addEventListener("input", function (event) {
    var field = event.target;
    if (!field || !field.name) {
      return;
    }

    field.removeAttribute("aria-invalid");
    var errorElement = errorElementFor(field.name);
    if (errorElement) {
      errorElement.textContent = "";
    }
  });

  form.addEventListener("submit", async function (event) {
    if (!window.fetch || !window.FormData) {
      return;
    }

    event.preventDefault();
    clearFieldErrors();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setSubmitting(true);
    setStatus("", currentMessages().sending, false);

    var controller = window.AbortController ? new AbortController() : null;
    var timeout = window.setTimeout(function () {
      if (controller) {
        controller.abort();
      }
    }, 20000);

    try {
      var requestOptions = {
        method: "POST",
        body: new FormData(form),
        headers: {
          Accept: "application/json"
        }
      };

      if (controller) {
        requestOptions.signal = controller.signal;
      }

      var response = await fetch(form.action, requestOptions);
      var payload = null;

      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      if (response.ok) {
        form.reset();
        clearFieldErrors();
        setStatus("success", currentMessages().success, true);
        return;
      }

      if (response.status === 429) {
        setStatus("error", currentMessages().rateLimit, true);
        return;
      }

      var firstInvalidField = applyServerErrors(payload && payload.errors);
      if (firstInvalidField) {
        setStatus("error", currentMessages().validation, false);
        firstInvalidField.focus();
        return;
      }

      setStatus("error", currentMessages().failure, true);
    } catch (error) {
      setStatus("error", currentMessages().network, true);
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  });
}());
