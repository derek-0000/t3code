# Custom background

In web or desktop, open **Settings → Appearance → Custom background**. Turn on the switch,
then select **Customize background**, or run **Customize background** from the command palette.
The controller opens over your current chat, or returns you to your last chat from Settings.
If there is no previous chat, the app opens a draft for your most recently used project.
With no projects yet, you can configure the background behind the add-project screen.

Your current background configuration stays selected. Adjust it directly in the app, drag
the controller by its header, or minimize it to see more of your chat. It stays open as you
switch chats. Opening Settings, Usage, or Pull requests closes it. Opening the theme editor
closes the background controller, and vice versa.
Changes save automatically; **Done** or close keeps them. **Enable custom background** in the
controller and the switch in Settings control the same preference. Turning either off hides the
background everywhere without deleting your selection or library. The controller stays open
so you can turn it back on. Select **None** in the controller to deselect the background.

## Backgrounds

A background is a picture (or nothing, for gradients), a filter, and a fade. Create one with
the **+** button. New backgrounds start without an image or filter. Choose an image
(JPEG, PNG, WebP, or HEIC) or a gradient filter, then edit the name. Delete backgrounds
from the background picker; deleting one never deletes its image.

## Filters

Filters are shaders from Paper. Their controls match the ones in Paper's playgrounds.
Every filter renders a single still frame; Grain gradient exposes a **Variation** slider
to pick the frame instead of animating.

- Image filters: Dithering, Fluted glass, Lens distortion. Choose **No filter**
  to show the picture as is.
- Gradient filters: Mesh gradient and Grain gradient paint the whole picture themselves and
  ignore the image.

Filters need WebGL. In a browser without it the background renders nothing, and the studio
controller says so.

## Fade

**Fade** blends your theme's background color over the picture, strongest at the bottom
where the composer sits. 100% is the shipped look; lower it to see more of the picture.

## Images

Images are resized, converted to WebP, and stored on this client only. Uploading the same
file twice reuses the stored copy. **Change image…** lists every stored image, lets you
upload another, and deletes the ones no background uses. Images stay on this client when you
connect to remote environments; other browsers, devices, and T3 Code Mobile keep their own
appearance.

## New chats and conversations

While custom backgrounds are enabled, the selected background appears on new chats.
**Show in threads**, inside the controller, decides whether it stays after you submit
your first prompt. When off, the background disappears as soon as you submit. Changes
take effect immediately, including while the controller is open. Both switches keep their
values after a refresh.

**Restore defaults** deselects the background and turns both switches back on, but keeps your
library.
