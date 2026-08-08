---
permalink: /project/particules/ui/
title: "Particules - ui"
layout: single
author_profile: false
---


{% include particules-nav.html %}

<div class="lang-en" markdown="1">

# PART 4 : INTERACTION DESIGN (UI/UX)

In JUCE, a plugin's GUI is implemented via the `PluginEditor` class, which consists of hierarchically organised `juce::Component`s positioned dynamically.

{% highlight cpp %}
void ParticulesAudioProcessorEditor::resized()
{
    juce::Rectangle<int> bounds = getLocalBounds(); 
    const int pianoHeight = 60;
    keyboardComponent.setBounds(bounds.removeFromBottom(pianoHeight));
    mainPanel.setBounds(bounds);
}
{% endhighlight %}

The appearance and rendering of components are centralised in a class derived from `juce::LookAndFeel_V4`. This class defines:

* colours
* graphic styles
* drawing primitives (sliders, buttons, menus)

It acts as a **global theme**, ensuring visual consistency and maintainability.

The design is inspired by the plugins <a href="https://www.audiodamage.com/collections/effects/products/ad054-other-desert-cities" target="_blank" rel="noopener noreferrer">**`Other Desert Cities`**</a> and <a href="https://www.audiodamage.com/collections/granular-synthesis/products/ad055-quanta-2/" target="_blank" rel="noopener noreferrer">**`Quanta 2`**</a> from **`Audio Damage`**.

The high parameter density inherent to granular synthesis is the main challenge, requiring a clear and hierarchical organisation.

No skeuomorphism is used: the plugin does not attempt to mimic hardware (e.g., vertical sliders imitating analogue console channels). The goal is not to replicate a physical reference.

---
## 4.1 ROTARY SLIDER

The main parameters use `juce::Slider` in rotary mode.

* **Creating a pre‑configured slider** via `setSliderStyle(juce::Slider::RotaryHorizontalVerticalDrag)`

{% highlight cpp %}
class PrimaryRotarySlider : public juce::Slider
{
public:
    PrimaryRotarySlider()
    {
        setSliderStyle(juce::Slider::RotaryHorizontalVerticalDrag);
        setTextBoxStyle(juce::Slider::NoTextBox, false, 0, 0);
        setRange(0.0, 1.0, 0.01);

        setColour(juce::Slider::rotarySliderFillColourId, coloursv2::cyan);
        setColour(juce::Slider::rotarySliderOutlineColourId, colours::grisAnthracite);

        getProperties().set("RotaryType", static_cast<int>(RotaryType::primary));
        setRepaintsOnMouseActivity(true);
    }
};    
{% endhighlight %}

* **Synchronisation with APVTS** via `juce::AudioProcessorValueTreeState::SliderAttachment`. It automatically sends notifications (`SendValueNotifyingHost`).

{% highlight cpp %}
GrainsPanel()
{
        gainAttachment = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
            processor.apvts, "gain", gainSlider);

        addAndMakeVisible(&gainSlider);
}
{% endhighlight %}

* **Visual rendering**: override `drawRotarySlider` in the LookAndFeel.

{% highlight cpp %}
void MainLNF::drawPrimaryKnob(juce::Graphics& g, float cx, float cy, float radius, float innerR,
                              float startAngle, float endAngle, float sliderPos, juce::Slider& slider) const
{
    const float thickness = radius * 0.03f;
    const float arcRadius = radius - thickness * 0.5f;
    const float angle = startAngle + sliderPos * (endAngle - startAngle);

    // 1. border arc
    {
        juce::Path borderPath;
        borderPath.addArc(cx - arcRadius, cy - arcRadius,
                          arcRadius * 2.0f, arcRadius * 2.0f,
                          startAngle, endAngle, true);
        g.setColour(colours::grisMoyen);
        g.strokePath(borderPath, juce::PathStrokeType(thickness,
                     juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }

    // 2. value arc
    {
        juce::Path valuePath;
        valuePath.addArc(cx - arcRadius, cy - arcRadius,
                         arcRadius * 2.0f, arcRadius * 2.0f,
                         startAngle, angle, true);
        g.setColour(colours::violetBleu);
        g.strokePath(valuePath, juce::PathStrokeType(thickness,
                     juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }

    // 3. Contour (inner circle)
    {
        const float contourRadius = innerR;
        g.setColour(colours::smokyBlack.brighter(0.20f));
        g.drawEllipse(cx - contourRadius, cy - contourRadius,
                      contourRadius * 2.0f, contourRadius * 2.0f, thickness);
    }

    // 4. center text (value + unit)
    {
        const bool isHovered = slider.isMouseOverOrDragging();
        juce::String text = slider.getTextFromValue(slider.getValue());
        if (text.isEmpty())
            text = juce::String(slider.getValue(), 2);

        // splitValueAndUnit
        juce::String valueStr, unitStr;
        int splitIdx = -1;
        for (int i = 0; i < text.length(); ++i)
        {
            juce::juce_wchar c = text[i];
            if (!juce::CharacterFunctions::isDigit(c) && c != '.' && c != ',' && c != '-' && c != ' ')
            {
                splitIdx = i;
                break;
            }
        }
        if (splitIdx > 0)
        {
            valueStr = text.substring(0, splitIdx).trimEnd();
            unitStr = text.substring(splitIdx).trimStart();
        }
        else
        {
            valueStr = text;
            unitStr = "";
        }

        const float valueFontSize = radius * 0.4f;
        const float unitFontSize = radius * 0.3f;
        const float spacing = radius * 0.05f;
        juce::Colour textColor = isHovered ? coloursv2::white : coloursv2::white.withAlpha(0.85f);
        g.setColour(textColor);

        if (unitStr.isNotEmpty())
        {
            const float totalHeight = valueFontSize + unitFontSize + spacing;
            float yPos = cy - totalHeight * 0.5f;

            g.setFont(juce::Font(geistRegular).withHeight(valueFontSize));
            g.drawText(valueStr, cx - radius * 0.8f, yPos, radius * 1.6f, valueFontSize,
                       juce::Justification::centred, false);

            yPos += valueFontSize + spacing;
            g.setFont(juce::Font(geistRegular).withHeight(unitFontSize));
            g.drawText(unitStr, cx - radius * 0.8f, yPos, radius * 1.6f, unitFontSize,
                       juce::Justification::centred, false);
        }
        else
        {
            g.setFont(juce::Font(geistRegular).withHeight(valueFontSize));
            g.drawText(valueStr, cx - radius * 0.8f, cy - valueFontSize * 0.5f,
                       radius * 1.6f, valueFontSize, juce::Justification::centred, false);
        }
    }
}
{% endhighlight %}

* **Value updates**:

{% highlight cpp %}
    gainSlider.onValueChange = [this]() {
        updateAngle();
        gainSlider.repaint();

        if(audioState.getIsLinked() && onValueChanged)
            onValueChanged(gainSlider.getValue());
    };
{% endhighlight %}

Note: for readability, the presented code differs slightly from the actual implementation.

---

## 4.2 WAVEFORM

The waveform rendering is handled by `juce::AudioThumbnail`. This class works asynchronously to avoid blocking the interface while loading large audio files.

The component's `paint` method uses `thumbnail.drawChannel()` to dynamically adapt the display to the available dimensions.

{% highlight cpp %}
void ThumbnailComponent::paintIfNoFileLoaded(juce::Graphics& g)
{
    g.fillAll(colours::black);
    paintGrid(g);
    noFileLabel.setVisible(true);
}

void ThumbnailComponent::paintIfFileLoaded(juce::Graphics& g)
{
    noFileLabel.setVisible(false);
    g.fillAll(colours::smokyBlack);
    paintGrid(g);
    g.setColour(colours::brightBlue);
    audioThumbnail.drawChannels(g, getLocalBounds(), 0.0, audioThumbnail.getTotalLength(), 1.0f);
}
{% endhighlight %}

---

## 4.3 HYBRID ROTARY MENU

Goal: provide a control that allows both visualisation of a parameter and selection of its type.

The component is hybrid:

* **continuous control** (vertical drag variation)
* **context menu** (discrete mode selection)

It thus combines the mechanics of a context menu with the aesthetics of a rotary control, optimising screen space.

* **Hit‑testing selection**: instead of adding a `juce::ComboBox`, the component overrides mouse events. The distance between the click and the centre is used to discriminate the interaction: a click inside the central area opens the menu, while a click on the outer ring activates continuous control.

{% highlight cpp %}
void RotaryMenuBase::mouseUp(const juce::MouseEvent& e)
{
    mainSlider.mouseUp(e.getEventRelativeTo(&mainSlider));
    if(!isDraggingSlider)
    {
        showPopupMenu();
    }
    isDraggingSlider = false;
}
void RotaryMenuBase::showPopupMenu()
{
    juce::PopupMenu menu;

    menu.setLookAndFeel(&getLookAndFeel());

    juce::StringArray options = modeParam->getAllValueStrings();

    for(int i = 0; i < options.size(); ++i)
    {
        menu.addItem(i + 1, "", true, false, createMenuIcon(i));
    }

    juce::PopupMenu::Options optionsPopup;
    optionsPopup =
        optionsPopup.withTargetScreenArea(juce::Rectangle<int>(getScreenPosition().x, getScreenPosition().y, 1, 1));

    menu.showMenuAsync(optionsPopup, [this, options](int result) {
        if(result > 0)
        {
            float newValue = static_cast<float>(result - 1) / (options.size() - 1);
            modeParam->setValueNotifyingHost(newValue);
        }
    });
}
{% endhighlight %}

* **Central curve**: the middle section of the control serves as a dynamic visual indicator. A `juce::Path` is built using `gui::evaluateTraversal` and `gui::evaluateEnvelope`, and is rendered inside the circular radius at the center of the control

{% highlight cpp %}
juce::Image TraversalRotaryMenu::createMenuIcon(int itemIndex)
{
    const int w = 200;
    const int h = 40;
    juce::Image img(juce::Image::ARGB, w, h, true);
    juce::Graphics g(img);
    g.setImageResamplingQuality(juce::Graphics::highResamplingQuality);

    auto mode = static_cast<TraversalMode>(itemIndex);
    juce::Path p;
    const float padding = 5.0f;
    const float drawW = w - (padding * 2.0f);
    const float drawH = h - (padding * 2.0f);

    for(int i = 0; i <= w; ++i)
    {
        float phase = static_cast<float>(i) / w;
        float val = gui::evaluateTraversal(mode, phase, 0.5f);

        float x = padding + (phase * drawW);
        float y = padding + drawH * (1.0f - val);

        if(i == 0)
            p.startNewSubPath(x, y);
        else
            p.lineTo(x, y);
    }

    g.setColour(juce::Colours::white);
    g.strokePath(p, juce::PathStrokeType(2.5f, juce::PathStrokeType::mitered, juce::PathStrokeType::rounded));

    return img;
}
{% endhighlight %}

Note: `gui::evaluateTraversal(mode, phase, 0.5f)` returns the function value for a given phase, used to generate the displayed curve.

---

## 4.4 CONTROLS ON THE WAVEFORM

Overlaid on the waveform, two controls allow you to define:

* the buffer playback position
* the selection range (span)

These parameters define an interval corresponding to the grain generation zone.

Interactions rely on overriding mouse events and using enumerations representing the component's interaction states.

{% highlight cpp %}
enum class HoverState { None, Position, Body, Edge };
enum class DragMode { None, Position, SpanBody, SpanEdge };
{% endhighlight %}

{% highlight cpp %}
void SliderOnWaveform::mouseMove(const juce::MouseEvent& e)
{
    HoverState newState = getHoverStateAt(e.position.x);

    if(newState != currentHover)
    {
        currentHover = newState;
        switch(newState)
        {
            case HoverState::Position:
            case HoverState::Edge:
                setMouseCursor(juce::MouseCursor::LeftRightResizeCursor);
                    break;
            case HoverState::Body:
                setMouseCursor(juce::MouseCursor::DraggingHandCursor); 
                    break;
            default:
                setMouseCursor(juce::MouseCursor::NormalCursor);
                    break;
        }
    repaint();
    }
}
void SliderOnWaveform::mouseExit(const juce::MouseEvent& /*e*/) 
{
    if(currentHover != HoverState::None)
    {
        currentHover = HoverState::None;
        repaint();
        setMouseCursor(juce::MouseCursor::NormalCursor);
    }
}
{% endhighlight %}

* **Coordinates**: the horizontal pixel position is normalised by the component's width to produce a value between 0 and 1, equivalent to a horizontal slider. This value is then passed to the APVTS via `ParameterAttachment`.

{% highlight cpp %}
void SliderOnWaveform::mouseDrag(const juce::MouseEvent& e)
{
    if(dragMode == DragMode::None)
        return;

    const float w = static_cast<float>(getWidth());
    float deltaNorm = (e.position.x - dragStartX) / w;

    if(dragMode == DragMode::Position)
    {
        float newPos = juce::jlimit(0.0f, 1.0f, dragStartPos + deltaNorm);
        positionAttachment->setValueAsPartOfGesture(newPos);
    }
    else if(dragMode == DragMode::SpanBody)
    {
        // span should move with the position but keep its value
        float newPos = juce::jlimit(0.0f, 1.0f, dragStartPos + deltaNorm);
        positionAttachment->setValueAsPartOfGesture(newPos);
    }
    else if(dragMode == DragMode::SpanEdge)
    {
        // position shouldn't move while moving the span edge
        float currentEndNorm = (dragStartPos + dragStartSpan) + deltaNorm;
        float newSpan = juce::jmax(0.0f, currentEndNorm - dragStartPos);
        spanAttachment->setValueAsPartOfGesture(newSpan);
    }
}
{% endhighlight %}

Calls to `beginGesture()` and `endGesture()` are respectively performed in `mouseDown()` and `mouseUp()` to ensure proper integration with DAW automation.

---

## 4.5 GRAIN POSITION OVERLAY

This component provides visual feedback on the position and amplitude of active grains inside the buffer.

To do so, it relies on:

* a `PingPongBuffer` producing snapshots (`VisualSnapshot`) (see Part 3)
* a UI polling system (~30 Hz) via `juce::Timer`

For rendering, each grain is represented by a marker whose:

* horizontal position corresponds to its sample position in the buffer, projected onto the thumbnail
* vertical position is determined by a pre‑computed pseudo‑random LUT (O(1) on the DSP side)
* opacity depends on the grain's envelope

{% highlight cpp %}
const VisualSnapshot& UIState::getSnapshot() const noexcept 
{ 
    return visualBuffer->getReadBuffer(); 
}
{% endhighlight %}

{% highlight cpp %}
void GrainVisualComponent::paint(juce::Graphics& g)
{
    if(invWidthSamples == 0.f)
        return;
    const VisualSnapshot& snap = uiState.getSnapshot();

    for(int i = 0; i < snap.count; ++i)
    {
        const GrainVisual& gv = snap.grainVisuals[i];
        const float samplePos = gv.xPos * invWidthSamples;
        const float yPos = gv.yPos * static_cast<float>(getHeight());
        const float opacity = gv.opacity;
        g.setColour(colour.withAlpha(opacity));
        g.fillEllipse(samplePos - GCENTER, yPos, GSIZE, GSIZE);
    }
}
{% endhighlight %}

</div>

<div class="lang-fr" markdown="1">

# PARTIE 4 : DESIGN D'INTERACTION (UI/UX)

Avec JUCE, l'interface graphique d'un plugin est implémentée via la classe `PluginEditor`, composée de `juce::Component` organisés hiérarchiquement et positionnés dynamiquement.

{% highlight cpp %}
void ParticulesAudioProcessorEditor::resized()
{
    juce::Rectangle<int> bounds = getLocalBounds(); 
    const int pianoHeight = 60;
    keyboardComponent.setBounds(bounds.removeFromBottom(pianoHeight));
    mainPanel.setBounds(bounds);
}
{% endhighlight %}

L'apparence et le rendu des composants sont centralisés dans une classe dérivée de `juce::LookAndFeel_V4`. Cette classe définit :

* les couleurs  
* les styles graphiques  
* les primitives de dessin (sliders, boutons, menus)

Elle agit comme un **thème global**, garantissant la cohérence visuelle et la maintenabilité.

Le design s'inspire des plugins <a href="https://www.audiodamage.com/collections/effects/products/ad054-other-desert-cities" target="_blank" rel="noopener noreferrer">**`Other Desert Cities`**</a> et <a href="https://www.audiodamage.com/collections/granular-synthesis/products/ad055-quanta-2/" target="_blank" rel="noopener noreferrer">**`Quanta 2`**</a> de **`Audio Damage`**.

La densité de paramètres propre à la synthèse granulaire constitue le principal défi, nécessitant une organisation claire et hiérarchisée.

Aucun *skeuomorphisme* n'est retenu : le plugin ne répond pas à des contraintes de fidélité au matériel (par exemple, des sliders verticaux imitant des tranches de console analogique). L'objectif n'est pas de reproduire un référent physique.

---
## 4.1 SLIDER ROTATIF

Les paramètres principaux utilisent `juce::Slider` en mode rotatif.

* **Création d'un slider préconfiguré** via `setSliderStyle(juce::Slider::RotaryHorizontalVerticalDrag)`

{% highlight cpp %}
class PrimaryRotarySlider : public juce::Slider
{
public:
    PrimaryRotarySlider()
    {
        setSliderStyle(juce::Slider::RotaryHorizontalVerticalDrag);
        setTextBoxStyle(juce::Slider::NoTextBox, false, 0, 0);
        setRange(0.0, 1.0, 0.01);

        setColour(juce::Slider::rotarySliderFillColourId, coloursv2::cyan);
        setColour(juce::Slider::rotarySliderOutlineColourId, colours::grisAnthracite);

        getProperties().set("RotaryType", static_cast<int>(RotaryType::primary));
        setRepaintsOnMouseActivity(true);
    }
};    
{% endhighlight %}

* **Synchronisation avec l'APVTS** via `juce::AudioProcessorValueTreeState::SliderAttachment`. Celui-ci gère automatiquement l'envoi des notifications (`SendValueNotifyingHost`).

{% highlight cpp %}
GrainsPanel()
{
        gainAttachment = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
            processor.apvts, "gain", gainSlider);

        addAndMakeVisible(&gainSlider);
}
{% endhighlight %}

* **Rendu visuel** : surcharge de `drawRotarySlider` dans le LookAndFeel.

{% highlight cpp %}
void MainLNF::drawPrimaryKnob(juce::Graphics& g, float cx, float cy, float radius, float innerR,
                              float startAngle, float endAngle, float sliderPos, juce::Slider& slider) const
{
    const float thickness = radius * 0.03f;
    const float arcRadius = radius - thickness * 0.5f;
    const float angle = startAngle + sliderPos * (endAngle - startAngle);

    // 1. border arc
    {
        juce::Path borderPath;
        borderPath.addArc(cx - arcRadius, cy - arcRadius,
                          arcRadius * 2.0f, arcRadius * 2.0f,
                          startAngle, endAngle, true);
        g.setColour(colours::grisMoyen);          // couleur par défaut de drawBorderArc
        g.strokePath(borderPath, juce::PathStrokeType(thickness,
                     juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }

    // 2. value arc
    {
        juce::Path valuePath;
        valuePath.addArc(cx - arcRadius, cy - arcRadius,
                         arcRadius * 2.0f, arcRadius * 2.0f,
                         startAngle, angle, true);
        g.setColour(colours::violetBleu);
        g.strokePath(valuePath, juce::PathStrokeType(thickness,
                     juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }

    // 3. Contour (inner circle)
    {
        const float contourRadius = innerR;
        g.setColour(colours::smokyBlack.brighter(0.20f));
        g.drawEllipse(cx - contourRadius, cy - contourRadius,
                      contourRadius * 2.0f, contourRadius * 2.0f, thickness);
    }

    // 4. center text (value + unit)
    {
        const bool isHovered = slider.isMouseOverOrDragging();
        juce::String text = slider.getTextFromValue(slider.getValue());
        if (text.isEmpty())
            text = juce::String(slider.getValue(), 2);

        // splitValueAndUnit
        juce::String valueStr, unitStr;
        int splitIdx = -1;
        for (int i = 0; i < text.length(); ++i)
        {
            juce::juce_wchar c = text[i];
            if (!juce::CharacterFunctions::isDigit(c) && c != '.' && c != ',' && c != '-' && c != ' ')
            {
                splitIdx = i;
                break;
            }
        }
        if (splitIdx > 0)
        {
            valueStr = text.substring(0, splitIdx).trimEnd();
            unitStr = text.substring(splitIdx).trimStart();
        }
        else
        {
            valueStr = text;
            unitStr = "";
        }

        const float valueFontSize = radius * 0.4f;
        const float unitFontSize = radius * 0.3f;
        const float spacing = radius * 0.05f;
        juce::Colour textColor = isHovered ? coloursv2::white : coloursv2::white.withAlpha(0.85f);
        g.setColour(textColor);

        if (unitStr.isNotEmpty())
        {
            const float totalHeight = valueFontSize + unitFontSize + spacing;
            float yPos = cy - totalHeight * 0.5f;

            g.setFont(juce::Font(geistRegular).withHeight(valueFontSize));
            g.drawText(valueStr, cx - radius * 0.8f, yPos, radius * 1.6f, valueFontSize,
                       juce::Justification::centred, false);

            yPos += valueFontSize + spacing;
            g.setFont(juce::Font(geistRegular).withHeight(unitFontSize));
            g.drawText(unitStr, cx - radius * 0.8f, yPos, radius * 1.6f, unitFontSize,
                       juce::Justification::centred, false);
        }
        else
        {
            g.setFont(juce::Font(geistRegular).withHeight(valueFontSize));
            g.drawText(valueStr, cx - radius * 0.8f, cy - valueFontSize * 0.5f,
                       radius * 1.6f, valueFontSize, juce::Justification::centred, false);
        }
    }
}
{% endhighlight %}

* **Mise à jour des valeurs** :

{% highlight cpp %}
    gainSlider.onValueChange = [this]() {
        updateAngle();
        gainSlider.repaint();

        if(audioState.getIsLinked() && onValueChanged)
            onValueChanged(gainSlider.getValue());
    };
{% endhighlight %}

Note : pour des raisons de lisibilité, le code présenté diffère légèrement de l'implémentation réelle.

---

## 4.2 FORME D'ONDE

Le rendu de la forme d'onde est géré via `juce::AudioThumbnail`. Cette classe fonctionne de manière asynchrone afin d'éviter de bloquer l'interface lors du chargement de fichiers audio volumineux.

La méthode `paint` du composant utilise `thumbnail.drawChannel()` pour adapter dynamiquement l'affichage aux dimensions disponibles.

{% highlight cpp %}
void ThumbnailComponent::paintIfNoFileLoaded(juce::Graphics& g)
{
    g.fillAll(colours::black);
    paintGrid(g);
    noFileLabel.setVisible(true);
}

void ThumbnailComponent::paintIfFileLoaded(juce::Graphics& g)
{
    noFileLabel.setVisible(false);
    g.fillAll(colours::smokyBlack);
    paintGrid(g);
    g.setColour(colours::brightBlue);
    audioThumbnail.drawChannels(g, getLocalBounds(), 0.0, audioThumbnail.getTotalLength(), 1.0f);
}
{% endhighlight %}

---

## 4.3 MENU ROTATIF HYBRIDE

Objectif : fournir un contrôle permettant à la fois la visualisation d'un paramètre et la sélection de sa nature.

Le composant est hybride :

* un **contrôle continu** (variation par glissement vertical)  
* un **menu contextuel** (sélection discrète du mode)

Il combine ainsi la mécanique d'un menu contextuel et l'esthétique d'un contrôle rotatif, optimisant l'espace disponible.

* **Mécanique de sélection (hit-testing)** : plutôt que d'ajouter un `juce::ComboBox`, le composant surcharge les événements souris. La distance entre le clic et le centre est utilisée pour discriminer l'interaction : un clic dans la zone centrale ouvre le menu, tandis qu'un clic sur la couronne externe active le contrôle continu.

{% highlight cpp %}
void RotaryMenuBase::mouseUp(const juce::MouseEvent& e)
{
    mainSlider.mouseUp(e.getEventRelativeTo(&mainSlider));
    if(!isDraggingSlider)
    {
        showPopupMenu();
    }
    isDraggingSlider = false;
}
void RotaryMenuBase::showPopupMenu()
{
    juce::PopupMenu menu;

    menu.setLookAndFeel(&getLookAndFeel());

    juce::StringArray options = modeParam->getAllValueStrings();

    for(int i = 0; i < options.size(); ++i)
    {
        menu.addItem(i + 1, "", true, false, createMenuIcon(i));
    }

    juce::PopupMenu::Options optionsPopup;
    optionsPopup =
        optionsPopup.withTargetScreenArea(juce::Rectangle<int>(getScreenPosition().x, getScreenPosition().y, 1, 1));

    menu.showMenuAsync(optionsPopup, [this, options](int result) {
        if(result > 0)
        {
            float newValue = static_cast<float>(result - 1) / (options.size() - 1);
            modeParam->setValueNotifyingHost(newValue);
        }
    });
}
{% endhighlight %}

* **Courbe centrale** : la zone centrale du contrôle sert d'indicateur dynamique. Un `juce::Path` est généré à partir des fonctions de `gui::evaluateTraversal` et `gui::evaluateEnvelope` pour dessiner dans le rayon au centre du contrôle.


{% highlight cpp %}
juce::Image TraversalRotaryMenu::createMenuIcon(int itemIndex)
{
    const int w = 200;
    const int h = 40;
    juce::Image img(juce::Image::ARGB, w, h, true);
    juce::Graphics g(img);
    g.setImageResamplingQuality(juce::Graphics::highResamplingQuality);

    auto mode = static_cast<TraversalMode>(itemIndex);
    juce::Path p;
    const float padding = 5.0f;
    const float drawW = w - (padding * 2.0f);
    const float drawH = h - (padding * 2.0f);

    for(int i = 0; i <= w; ++i)
    {
        float phase = static_cast<float>(i) / w;
        float val = gui::evaluateTraversal(mode, phase, 0.5f);

        float x = padding + (phase * drawW);
        float y = padding + drawH * (1.0f - val);

        if(i == 0)
            p.startNewSubPath(x, y);
        else
            p.lineTo(x, y);
    }

    g.setColour(juce::Colours::white);
    g.strokePath(p, juce::PathStrokeType(2.5f, juce::PathStrokeType::mitered, juce::PathStrokeType::rounded));

    return img;
}
{% endhighlight %}

Note : `(mode, phase, 0.5f)` retourne la valeur de la fonction pour une phase donnée, utilisée pour générer la courbe affichée.

---

## 4.4 CONTRÔLES SUR LA FORME D'ONDE

Superposés à la forme d'onde, deux contrôles permettent de définir :

* la position dans le buffer  
* l'étendue de la sélection (span)

Ces paramètres définissent un intervalle correspondant à la zone de génération des grains.

Les interactions reposent sur la surcharge des événements souris et sur l'utilisation d'énumérations représentant les états d'interaction du composant.

{% highlight cpp %}
enum class HoverState { None, Position, Body, Edge };
enum class DragMode { None, Position, SpanBody, SpanEdge };
{% endhighlight %}

{% highlight cpp %}
void SliderOnWaveform::mouseMove(const juce::MouseEvent& e)
{
    HoverState newState = getHoverStateAt(e.position.x);

    if(newState != currentHover)
    {
        currentHover = newState;
        switch(newState)
        {
            case HoverState::Position:
            case HoverState::Edge:
                setMouseCursor(juce::MouseCursor::LeftRightResizeCursor);
                    break;
            case HoverState::Body:
                setMouseCursor(juce::MouseCursor::DraggingHandCursor); 
                    break;
            default:
                setMouseCursor(juce::MouseCursor::NormalCursor);
                    break;
        }
    repaint();
    }
}
void SliderOnWaveform::mouseExit(const juce::MouseEvent& /*e*/) 
{
    if(currentHover != HoverState::None)
    {
        currentHover = HoverState::None;
        repaint();
        setMouseCursor(juce::MouseCursor::NormalCursor);
    }
}
{% endhighlight %}


* **Coordonnées** : la position horizontale en pixels est normalisée par rapport à la largeur du composant afin de produire une valeur comprise entre 0 et 1, équivalente à celle d'un slider horizontal. Cette valeur est ensuite transmise à l'APVTS via `ParameterAttachment`.


{% highlight cpp %}
void SliderOnWaveform::mouseDrag(const juce::MouseEvent& e)
{
    if(dragMode == DragMode::None)
        return;

    const float w = static_cast<float>(getWidth());
    float deltaNorm = (e.position.x - dragStartX) / w;

    if(dragMode == DragMode::Position)
    {
        float newPos = juce::jlimit(0.0f, 1.0f, dragStartPos + deltaNorm);
        positionAttachment->setValueAsPartOfGesture(newPos);
    }
    else if(dragMode == DragMode::SpanBody)
    {
        // span should move with the position but keep its value
        float newPos = juce::jlimit(0.0f, 1.0f, dragStartPos + deltaNorm);
        positionAttachment->setValueAsPartOfGesture(newPos);
    }
    else if(dragMode == DragMode::SpanEdge)
    {
        // position shouldnt move while moving the span edge
        float currentEndNorm = (dragStartPos + dragStartSpan) + deltaNorm;
        float newSpan = juce::jmax(0.0f, currentEndNorm - dragStartPos);
        spanAttachment->setValueAsPartOfGesture(newSpan);
    }
}
{% endhighlight %}

Les appels à `beginGesture()` et `endGesture()` sont respectivement effectués dans `mouseDown()` et `mouseUp()` afin d'assurer une intégration correcte avec l'automation des DAWs.

---

## 4.5 POSITION DES GRAINS (OVERLAY)

Ce composant fournit un retour visuel de la position et de l'amplitude des grains actifs dans le buffer.

Pour cela, il repose sur :

* un `PingPongBuffer` produisant des snapshots (`VisualSnapshot`) (cf. Partie 3)  
* un système de polling de l'interface (~30 Hz) via `juce::Timer`

Pour le rendu, chaque grain est représenté par un marqueur dont :

* la position horizontale correspond à sa position en échantillons dans le buffer, projetée sur le thumbnail  
* la position verticale est déterminée par une LUT de valeurs pseudo-aléatoires pré-calculées en O(1) côté DSP  
* l'opacité dépend de l'enveloppe du grain



{% highlight cpp %}
const VisualSnapshot& UIState::getSnapshot() const noexcept 
{ 
    return visualBuffer->getReadBuffer(); 
}
{% endhighlight %}

{% highlight cpp %}
void GrainVisualComponent::paint(juce::Graphics& g)
{
    if(invWidthSamples == 0.f)
        return;
    const VisualSnapshot& snap = uiState.getSnapshot();

    for(int i = 0; i < snap.count; ++i)
    {
        const GrainVisual& gv = snap.grainVisuals[i];
        const float samplePos = gv.xPos * invWidthSamples;
        const float yPos = gv.yPos * static_cast<float>(getHeight());
        const float opacity = gv.opacity;
        g.setColour(colour.withAlpha(opacity));
        g.fillEllipse(samplePos - GCENTER, yPos, GSIZE, GSIZE);
    }
}
{% endhighlight %}

</div>