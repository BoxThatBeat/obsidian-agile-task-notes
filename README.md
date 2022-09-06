
# Stay on top of your tasks with Agile-Task-Notes!

Import your tasks from your TFS to take notes on them and make todo-lists!   
This plugin currently supports these TFS systems: {**Jira**, **Azure Devops**}

### Kanban Board generation:
![Kanban](https://user-images.githubusercontent.com/28713093/187089414-e6c6788c-d2e2-428f-bb8e-ed3c9edc21c5.gif)

### Task notes generation:
![OpenLinks](https://user-images.githubusercontent.com/28713093/187089532-7c4f665d-f5c3-4729-918f-8bdba97f4739.gif)

### Task todo lists:
![Todo](https://user-images.githubusercontent.com/28713093/187089536-6789cd8f-e503-470f-a1bd-016d95df20bc.gif)


## Features:
- Generates local copy of Kanban board with only tasks assigned to you for easy task navigation in Obsidian
- Automatically creates all your tasks as files where you can add notes and todo lists for your tasks
- Customize starter content of the generated task notes in settings

## Important: 
This plugin works best with these other community plugins (I take no credit for these great plugins):
- \"Kanban\" by mgmeyers 
- \"Checklist\" by delashum (Less important but works nicely alongside this plugin)
If Kanban is not installed, there will be no UI for the Kanban board. However, the board generation can be toggled in settings.  

**Warning**: The settings are NOT encrypted, they are stored in plain text, so put your API key/ Personal Access Token in at your own risk

## Usage
There are 3 options for updating your tasks from TFS:
- Using the Update Interval setting to grab updates every x minutes automatically
- Using the left-hand button
- Using the command palette "Update Current Sprint"

Notes:
- The generated kanban board for the sprint is destroyed and replaced each time updates are pulled from TFS. This has the following implications:
	- Any manual changes to the kanban board of the current sprint will be deleted on each update of the board
	- The Time Interval setting should not be too low since when the kanban board note is openned when it is updated, it will close since it is deleted and replaced
- Please make backups of task notes since there may be bugs in this code and they could be removed.

## Installation

### From within Obsidian
From Obsidian v0.9.8, you can activate this plugin within Obsidian by doing the following:
- Open Settings > Third-party plugin
- Make sure Restricted mode is **off**
- Click Browse community plugins
- Search for this plugin
- Click Install
- Once installed, close the community plugins window and activate the newly installed plugin
#### Updates
You can follow the same procedure to update the plugin

### From GitHub
- Download the Latest Release from the Releases section of the GitHub Repository
- Extract the plugin folder from the zip to your vault's plugins folder: `<vault>/.obsidian/plugins/`  
Note: On some machines the `.obsidian` folder may be hidden. On MacOS you should be able to press `Command+Shift+Dot` to show the folder in Finder.
- Reload Obsidian
- If prompted about Safe Mode, you can disable safe mode and enable the plugin.
Otherwise head to Settings, third-party plugins, make sure safe mode is off and
enable the plugin from there.

## Development

If you want to contribute to development and/or just customize it with your own
tweaks, you can do the following:
- Clone this repo.
- `npm i` or `yarn` to install dependencies
- `npm run build` to compile.
- Copy `manifest.json`, `main.js` and `styles.css` to a subfolder of your plugins
folder (e.g, `<vault>/.obsidian/plugins/<plugin-name>/`)
- Reload obsidian to see changes

Alternately, you can clone the repo directly into your plugins folder and once
dependencies are installed use `npm run dev` to start compilation in watch mode.  
You may have to reload obsidian (`ctrl+R`) to see changes.

Note: feel free to add a new TFS backend that the plugin does not currently support and make a pull request. Simply follow the example of the current TfsClient implmentations and add it to the list of implementations in main.ts

## Pricing
This plugin is free to enjoy! However, if you wish to support my work, I would really appretiate it. You can do so here:   

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-green.png" alt="BuyMeACoffee" width="100">](https://www.buymeacoffee.com/BoxThatBeat)

