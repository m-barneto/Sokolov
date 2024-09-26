import { container, DependencyContainer } from "tsyringe";

// SPT types
import { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { PreSptModLoader } from "@spt/loaders/PreSptModLoader";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ImageRouter } from "@spt/routers/ImageRouter";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { Money } from "@spt/models/enums/Money";
import { Traders } from "@spt/models/enums/Traders";
import { HashUtil } from "@spt/utils/HashUtil";

// New trader settings
import * as baseJson from "../db/base.json";

import { TraderHelper } from "./traderHelpers";
import { VFS } from "@spt/utils/VFS";
import path from "node:path";
import { jsonc } from "jsonc";
import { DatabaseService } from "@spt/services/DatabaseService";
import { IHideoutProduction } from "@spt/models/eft/hideout/IHideoutProduction";

import productionJson = require("../db/production.json");

class Sokolov implements IPreSptLoadMod, IPostDBLoadMod {
    private mod: string;
    private logger: ILogger;
    private traderHelper: TraderHelper;

    private static vfs = container.resolve<VFS>("VFS");    
    private static config: SokolovConfig = jsonc.parse(Sokolov.vfs.readFile(path.resolve(__dirname, "../config/config.jsonc")));

    constructor() {
        this.mod = "Sokolov"; // Set name of mod so we can log it to console later
    }

    /**
     * Some work needs to be done prior to SPT code being loaded, registering the profile image + setting trader update time inside the trader config json
     * @param container Dependency container
     */
    public preSptLoad(container: DependencyContainer): void {
        // Get a logger
        this.logger = container.resolve<ILogger>("WinstonLogger");

        // Get SPT code/data we need later
        const preSptModLoader: PreSptModLoader = container.resolve<PreSptModLoader>("PreSptModLoader");
        const imageRouter: ImageRouter = container.resolve<ImageRouter>("ImageRouter");
        const configServer = container.resolve<ConfigServer>("ConfigServer");
        const traderConfig: ITraderConfig = configServer.getConfig<ITraderConfig>(ConfigTypes.TRADER);
        const ragfairConfig = configServer.getConfig<IRagfairConfig>(ConfigTypes.RAGFAIR);

        // Create helper class and use it to register our traders image/icon + set its stock refresh time
        this.traderHelper = new TraderHelper();
        this.traderHelper.registerProfileImage(baseJson, this.mod, preSptModLoader, imageRouter, "66f40eedc82974df308b27c4.jpg");
        this.traderHelper.setTraderUpdateTime(traderConfig, baseJson, Sokolov.config.traderRefreshMin, Sokolov.config.traderRefreshMax);

        // Add trader to trader enum
        Traders[baseJson._id] = baseJson._id;

        // Add trader to flea market
        ragfairConfig.traders[baseJson._id] = true;
    }

    /**
     * Majority of trader-related work occurs after the aki database has been loaded but prior to SPT code being run
     * @param container Dependency container
     */
    public postDBLoad(container: DependencyContainer): void {
        const startTime = performance.now();
        this.logger.debug(`[${this.mod}] Loading.`);

        // Resolve SPT classes we'll use
        const databaseServer: DatabaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const jsonUtil: JsonUtil = container.resolve<JsonUtil>("JsonUtil");

        // Get a reference to the database tables
        const tables = databaseServer.getTables();

        // Add new trader to the trader dictionary in DatabaseServer - has no assorts (items) yet
        this.traderHelper.addTraderToDb(baseJson, tables, jsonUtil);
        
        // Add trader to locale file, ensures trader text shows properly on screen
        // WARNING: adds the same text to ALL locales (e.g. chinese/french/english)
        this.traderHelper.addTraderToLocales(baseJson, tables, baseJson.name, baseJson._id, baseJson.nickname, baseJson.location, "");

        this.loadProductionEntries();


        this.logger.debug(`[${this.mod}] Loaded in ${performance.now() - startTime} ms.`);
    }

    private loadProductionEntries() {
        const databaseService: DatabaseService = container.resolve<DatabaseService>("DatabaseService");
        const hideoutProductions: IHideoutProduction[] = databaseService.getTables().hideout.production;

        // This needs to be tested to see if it actually puts our crafts into the list
        hideoutProductions.push(...productionJson);
    }
}

interface SokolovConfig {
    priceMultiplier: number;
    traderRefreshMin: number;
    traderRefreshMax: number;
    unlimitedStock: boolean;
    unlimitedBuyRestriction: boolean;
}

module.exports = { mod: new Sokolov() };
