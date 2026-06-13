import { Router, type IRouter } from "express";
import healthRouter from "./health";
import copilotRouter from "./copilot";
import routeRouter from "./route";
import executePaymentRouter from "./execute-payment";
import agentRouter from "./agent";
import historyRouter from "./history";

const router: IRouter = Router();

router.use(healthRouter);
router.use(copilotRouter);
router.use(routeRouter);
router.use(executePaymentRouter);
router.use(agentRouter);
router.use(historyRouter);

export default router;
